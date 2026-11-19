import { Navigate } from 'react-router-dom';

/** Old bookmark: receipt photos now live on the Expenses inbox under the Receipts filter. */
export function Receipts() {
  return <Navigate to="/expenses?type=receipts" replace />;
}
