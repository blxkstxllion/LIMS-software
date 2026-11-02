import { Reports } from "./Reports";

export function AnalyticsPage({ samples, results, coas }) {
  return <Reports samples={samples} results={results} coas={coas} />;
}
