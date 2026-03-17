import { Suspense } from "react";
import { ResultsContent } from "./results-content";

export const dynamic = "force-dynamic";

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsContent />
    </Suspense>
  );
}
