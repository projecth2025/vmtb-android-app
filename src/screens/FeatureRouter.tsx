import { FeatureScreenProps } from '../types';
import { CasesScreen } from './cases/CasesScreen';
import { CreateCaseScreen } from './cases/CreateCaseScreen';
import { CaseDetailScreen } from './cases/CaseDetailScreen';
import { MTBListScreen } from './mtbs/MTBListScreen';
import { MTBDetailScreen } from './mtbs/MTBDetailScreen';
import { MeetingDetailScreen } from './meetings/MeetingDetailScreen';
import { MeetingWaitingScreen } from './meetings/MeetingWaitingScreen';
import { MeetingLiveScreen } from './meetings/MeetingLiveScreen';
import { ProfileScreen } from './profile/ProfileScreen';
import { VerifyPhoneScreen } from './profile/VerifyPhoneScreen';
import { FeedbackScreen } from './feedback/FeedbackScreen';
import { EmptyPage } from './EmptyPage';
import { SampleCaseScreen } from './samples/SampleCaseScreen';
import { SampleBoardScreen } from './samples/SampleBoardScreen';

export function FeatureRouter(props: FeatureScreenProps) {
  const common = { onBack: props.onBack };
  switch (props.screen) {
    case 'cases':
    case 'archived':
      return <CasesScreen {...props} archived={props.screen === 'archived'} />;
    case 'case-create':
      return <CreateCaseScreen {...props} />;
    case 'case-detail':
      return props.activeCaseId ? (
        <CaseDetailScreen {...props} caseId={props.activeCaseId} />
      ) : (
        <EmptyPage {...common} title="Case not found" />
      );
    case 'mtbs':
      return <MTBListScreen {...props} />;
    case 'mtb-detail':
      return props.activeMtbId ? (
        <MTBDetailScreen {...props} mtbId={props.activeMtbId} />
      ) : (
        <EmptyPage {...common} title="MTB not found" />
      );
    case 'meeting-detail':
      return props.activeMeetingId ? (
        <MeetingDetailScreen {...props} meetingId={props.activeMeetingId} />
      ) : (
        <EmptyPage {...common} title="Meeting not found" />
      );
    case 'meeting-waiting':
      return props.meetingLaunch ? (
        <MeetingWaitingScreen {...props} launch={props.meetingLaunch} />
      ) : (
        <EmptyPage {...common} title="Meeting not found" />
      );
    case 'meeting-live':
      return props.meetingLaunch ? (
        <MeetingLiveScreen {...props} launch={props.meetingLaunch} />
      ) : (
        <EmptyPage {...common} title="Meeting not found" />
      );
    case 'profile':
      return <ProfileScreen {...props} />;
    case 'verify-phone':
      return (
        <VerifyPhoneScreen
          userId={props.userId}
          initialPhone={props.profile?.whatsapp_number ?? undefined}
          requiresPhoneCollection={!props.profile?.whatsapp_number}
          setScreen={props.setScreen ?? (() => {})}
          onVerified={() => {}}
          onBack={props.onBack}
        />
      );
    case 'feedback':
      return <FeedbackScreen {...props} />;
    case 'sample-case':
      return <SampleCaseScreen onBack={props.onBack} role={props.role} profile={props.profile} />;
    case 'sample-board':
      return <SampleBoardScreen onBack={props.onBack} role={props.role} onNavigate={props.onNavigate} />;
    default:
      return <EmptyPage {...common} title="Coming soon" />;
  }
}
