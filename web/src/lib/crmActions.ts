/**
 * CRM write path: IndexedDB → outbox via SyncEngine (Phase B).
 * Every edit updates child rows and refreshes flat primary fields on customers.
 */

import {
  blankActivity, blankCustomerTag, blankEmail, blankPhone, blankProperty, mirrorPrimaryFields,
} from './crm';
import { STAGE_SLUGS, stageTag, stageTagGroup } from './crmStage';
import type { SyncEngine } from './sync';
import type {
  Customer, CustomerActivity, CustomerActivityType, CustomerEmail, CustomerPhone,
  CustomerProperty, CustomerTag, Tag, TagGroup,
} from './types';
import { rowKey } from './types';

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tag';
}

export async function logActivity(
  engine: SyncEngine,
  orgId: string,
  customerId: string,
  type: CustomerActivityType,
  body: string,
  createdBy: string | null = null,
): Promise<void> {
  await engine.save('customer_activities', blankActivity(orgId, customerId, {
    type, body, at: new Date().toISOString(), created_by: createdBy,
  }));
}

/** Toggle a tag on a customer, respecting mode one/many. Pipeline changes log a stage activity. */
export async function toggleCustomerTag(
  engine: SyncEngine,
  args: {
    orgId: string;
    customerId: string;
    tag: Tag;
    group: TagGroup;
    groupTags: Tag[];
    memberships: CustomerTag[];
    createdBy?: string | null;
  },
): Promise<void> {
  const { orgId, customerId, tag, group, groupTags, memberships, createdBy = null } = args;
  const live = memberships.filter((m) => m.customer_id === customerId && !m.deleted_at);
  const on = live.some((m) => m.tag_id === tag.id);

  if (on) {
    const row = live.find((m) => m.tag_id === tag.id)!;
    await engine.remove('customer_tags', row);
    return;
  }

  if (group.mode === 'one') {
    const groupIds = new Set(groupTags.map((t) => t.id));
    for (const m of live) {
      if (groupIds.has(m.tag_id)) await engine.remove('customer_tags', m);
    }
  }

  const key = rowKey('customer_tags', { customer_id: customerId, tag_id: tag.id });
  const prev = await engine.get('customer_tags', key);
  const next: CustomerTag = prev
    ? { ...prev, deleted_at: null, org_id: orgId }
    : blankCustomerTag(orgId, customerId, tag.id);
  await engine.save('customer_tags', next);

  if (group.pipeline) {
    await logActivity(engine, orgId, customerId, 'stage', `Stage → ${tag.name}`, createdBy);
  }
}

/** Create a tag in an allow_new group (or reuse same-name) and attach it (always on). */
export async function addNewTag(
  engine: SyncEngine,
  args: {
    orgId: string;
    customerId: string;
    group: TagGroup;
    groupTags: Tag[];
    memberships: CustomerTag[];
    name: string;
    createdBy?: string | null;
  },
): Promise<Tag | null> {
  const name = args.name.trim();
  if (!name || !args.group.allow_new) return null;
  const existing = args.groupTags.find((t) => !t.deleted_at && t.name.toLowerCase() === name.toLowerCase());
  let tag = existing;
  if (!tag) {
    const maxSort = args.groupTags.reduce((n, t) => Math.max(n, t.sort), -1);
    tag = {
      id: crypto.randomUUID(),
      org_id: args.orgId,
      tag_group_id: args.group.id,
      name,
      slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`,
      color: '',
      sort: maxSort + 1,
      deleted_at: null,
    };
    await engine.save('tags', tag);
  }
  const alreadyOn = args.memberships.some(
    (m) => m.customer_id === args.customerId && m.tag_id === tag!.id && !m.deleted_at,
  );
  if (!alreadyOn) {
    await toggleCustomerTag(engine, {
      orgId: args.orgId,
      customerId: args.customerId,
      tag,
      group: args.group,
      groupTags: existing ? args.groupTags : [...args.groupTags, tag],
      memberships: args.memberships,
      createdBy: args.createdBy,
    });
  }
  return tag;
}

/**
 * Save a customer plus phones/emails/properties, mirror flat primaries, and
 * for brand-new customers attach New lead + created activity.
 */
export async function saveCustomerBundle(
  engine: SyncEngine,
  args: {
    orgId: string;
    customer: Customer;
    phones: CustomerPhone[];
    emails: CustomerEmail[];
    properties: CustomerProperty[];
    /** Prior live rows so removed ones can be soft-deleted. */
    prevPhones?: CustomerPhone[];
    prevEmails?: CustomerEmail[];
    prevProperties?: CustomerProperty[];
    isNew: boolean;
    groups: TagGroup[];
    tags: Tag[];
    createdBy?: string | null;
  },
): Promise<Customer> {
  const {
    orgId, phones, emails, properties, isNew, groups, tags, createdBy = null,
  } = args;

  const livePhones = phones.filter((p) => p.value.trim() && !p.deleted_at).map((p, i) => ({ ...p, value: p.value.trim(), sort: i }));
  const liveEmails = emails.filter((e) => e.value.trim() && !e.deleted_at).map((e, i) => ({ ...e, value: e.value.trim(), sort: i }));
  const liveProps = properties
    .map((p, i) => ({
      ...p,
      street: p.street.trim(),
      town: p.town.trim(),
      state: p.state.trim() || 'MI',
      zip: p.zip.trim(),
      gate_code: p.gate_code.trim(),
      access: p.access.trim(),
      tree_notes: p.tree_notes.trim(),
      hazards: (p.hazards ?? []).map((h) => h.trim()).filter(Boolean),
      sort: i,
    }))
    .filter((p) => p.street || p.town || p.zip || p.gate_code || p.access || p.tree_notes || p.hazards.length);

  const mirrored = mirrorPrimaryFields(
    {
      ...args.customer,
      first_name: args.customer.first_name.trim(),
      last_name: args.customer.last_name.trim(),
      company: args.customer.company.trim(),
      notes: args.customer.notes.trim(),
    },
    livePhones,
    liveEmails,
    liveProps,
  );

  await engine.save('customers', mirrored);

  const keepPhone = new Set(livePhones.map((p) => p.id));
  for (const p of args.prevPhones ?? []) {
    if (!p.deleted_at && !keepPhone.has(p.id)) await engine.remove('customer_phones', p);
  }
  for (const p of livePhones) await engine.save('customer_phones', p);

  const keepEmail = new Set(liveEmails.map((e) => e.id));
  for (const e of args.prevEmails ?? []) {
    if (!e.deleted_at && !keepEmail.has(e.id)) await engine.remove('customer_emails', e);
  }
  for (const e of liveEmails) await engine.save('customer_emails', e);

  const keepProp = new Set(liveProps.map((p) => p.id));
  for (const p of args.prevProperties ?? []) {
    if (!p.deleted_at && !keepProp.has(p.id)) await engine.remove('customer_properties', p);
  }
  for (const p of liveProps) await engine.save('customer_properties', p);

  if (isNew) {
    const sg = stageTagGroup(groups);
    const newTag = sg ? stageTag(tags, sg.id, STAGE_SLUGS.new) : undefined;
    if (sg && newTag) {
      await engine.save('customer_tags', blankCustomerTag(orgId, mirrored.id, newTag.id));
    }
    await logActivity(engine, orgId, mirrored.id, 'created', 'Added', createdBy);
  }

  return mirrored;
}

export async function softDeleteCustomer(
  engine: SyncEngine,
  customer: Customer,
  children: {
    phones: CustomerPhone[];
    emails: CustomerEmail[];
    properties: CustomerProperty[];
    memberships: CustomerTag[];
    activities: CustomerActivity[];
  },
): Promise<void> {
  for (const p of children.phones) if (!p.deleted_at) await engine.remove('customer_phones', p);
  for (const e of children.emails) if (!e.deleted_at) await engine.remove('customer_emails', e);
  for (const p of children.properties) if (!p.deleted_at) await engine.remove('customer_properties', p);
  for (const m of children.memberships) if (!m.deleted_at) await engine.remove('customer_tags', m);
  for (const a of children.activities) if (!a.deleted_at) await engine.remove('customer_activities', a);
  await engine.remove('customers', customer);
}

/** After a flat vCard import, create CRM child rows + New lead + imported activity. */
export async function enrichImportedCustomers(
  engine: SyncEngine,
  orgId: string,
  customers: Customer[],
  groups: TagGroup[],
  tags: Tag[],
  createdBy: string | null = null,
): Promise<void> {
  const sg = stageTagGroup(groups);
  const newTag = sg ? stageTag(tags, sg.id, STAGE_SLUGS.new) : undefined;
  for (const c of customers) {
    if (c.phone.trim()) {
      await engine.save('customer_phones', blankPhone(orgId, c.id, { value: c.phone, label: 'mobile', sort: 0 }));
    }
    if (c.email.trim()) {
      await engine.save('customer_emails', blankEmail(orgId, c.id, { value: c.email, label: 'work', sort: 0 }));
    }
    if (c.street.trim() || c.town.trim() || c.zip.trim()) {
      await engine.save('customer_properties', blankProperty(orgId, c.id, {
        street: c.street, town: c.town, state: c.state || 'MI', zip: c.zip, sort: 0,
      }));
    }
    if (newTag) await engine.save('customer_tags', blankCustomerTag(orgId, c.id, newTag.id));
    await logActivity(engine, orgId, c.id, 'imported', 'Imported from contact file', createdBy);
  }
}

export { blankPhone, blankEmail, blankProperty };
