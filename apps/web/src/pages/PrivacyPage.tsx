import { Card } from '@/components/ui';
import { Page } from '@/components/layout/Page';

export default function PrivacyPage() {
  return (
    <Page title="Privacy">
      <Card className="rich-text space-y-3 p-6 sm:p-8">
        <h1 className="mb-4 text-4xl font-semibold">Privacy policy</h1>
        <p><strong>What we collect.</strong> Your name, email, the recordings you choose to submit, payment reference numbers you enter, and your learning progress.</p>
        <p><strong>Microphone and camera.</strong> We only access your microphone or camera after you tap record and your browser asks for permission. Nothing is recorded in the background.</p>
        <p><strong>Who can see your recordings.</strong> Only you and your teachers. Recordings are stored in this app's database, or in your teacher's Google Drive after review, and are only revealed to you and your teachers.</p>
        <p><strong>Payments.</strong> Payments are made directly in your UPI app. We never see your bank or card details; we only store the reference number you submit for verification.</p>
        <p><strong>Your choices.</strong> You can update your name at any time. To delete your account and recordings, contact your teacher or the site administrator.</p>
      </Card>
    </Page>
  );
}
