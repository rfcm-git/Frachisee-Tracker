import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";
import { EmptyState, Card } from "../components/ui/core.jsx";
import { PageHeader } from "../components/layout/AppShell.jsx";

export default function NotFoundPage() {
  return (
    <div className="animate-fade-up">
      <PageHeader title="Page not found" />
      <Card>
        <EmptyState icon={SearchX} title="This page doesn't exist" action={<Link to="/" className="font-medium text-brand-700 hover:underline">Back to the dashboard</Link>}>
          The link may be old, or the store or issue was removed. Press Ctrl K to search instead.
        </EmptyState>
      </Card>
    </div>
  );
}
