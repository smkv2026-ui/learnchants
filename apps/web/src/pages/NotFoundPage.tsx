import { Link } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';
import { Page } from '@/components/layout/Page';

export default function NotFoundPage() {
  return (
    <Page title="Not found">
      <EmptyState art="diya" title="Page not found" message="The path you followed doesn't lead anywhere." action={<Link to="/"><Button>Go home</Button></Link>} />
    </Page>
  );
}
