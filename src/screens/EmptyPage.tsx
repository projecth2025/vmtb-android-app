import { EmptyCard, Page } from '../components/ui';

/** Fallback screen for a route with nothing to show. */
export function EmptyPage({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Page title={title} onBack={onBack}>
      <EmptyCard title={title} body="This page is not available yet." />
    </Page>
  );
}
