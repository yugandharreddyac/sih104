import { CallsService, CallRecord } from '../calls/calls.service';
import { RiskService } from '../risk/risk.service';
import { ConversationService } from '../conversation/conversation.service';
import { IncidentsService, IncidentRecord } from '../incidents/incidents.service';
import { InterventionService } from '../interventions/intervention.service';
import { InterventionRecord } from '../interventions/types';

export interface InvestigationDisposition {
  status: string;
  callStatus: string;
  summary: string;
  hasActiveInterventions: boolean;
  pendingInterventionsCount: number;
  totalInterventionsCount: number;
}

export interface InvestigationDetails {
  call: CallRecord;
  risk: any;
  riskTimeline: any[];
  evidence: any;
  conversation: any;
  incidents: IncidentRecord[];
  interventions: InterventionRecord[];
  disposition: InvestigationDisposition;
}

export class InvestigationsService {
  public static async getInvestigation(
    callId: string,
    organizationId: string
  ): Promise<InvestigationDetails | null> {
    const call = CallsService.getCallById(callId);
    if (!call) {
      return null;
    }

    const risk = RiskService.getAssessmentForCall(callId);
    const riskTimeline = RiskService.getTimelineForCall(callId);
    const evidence = RiskService.getEvidenceForCall(callId);

    let conversation: any;
    try {
      conversation = await ConversationService.getSummary(callId);
    } catch {
      conversation = {
        call_id: callId,
        total_turns: 0,
        transcript_redacted: 'Conversational memory unavailable (AI offline).',
      };
    }

    const allIncidents = IncidentsService.listIncidents(organizationId);
    const incidents = allIncidents.filter((incident) => incident.callId === callId);

    const allInterventions = InterventionService.listInterventions(organizationId);
    const interventions = allInterventions.filter((intervention) => intervention.callId === callId);

    const disposition = this.deriveDisposition(call, interventions);

    return {
      call,
      risk,
      riskTimeline,
      evidence,
      conversation,
      incidents,
      interventions,
      disposition,
    };
  }

  private static deriveDisposition(call: CallRecord, interventions: InterventionRecord[]): InvestigationDisposition {
    const pendingInterventions = interventions.filter(
      (i) => i.status === 'AWAITING_HUMAN' || i.status === 'AI_RECOMMENDED'
    );
    const executedInterventions = interventions.filter(
      (i) => i.status === 'EXECUTED' || i.status === 'POLICY_APPROVED' || i.humanDecision === 'APPROVED'
    );

    let status = 'NO_FINAL_DISPOSITION';
    let summary = 'Call is in progress with no final security disposition.';

    if (call.status === 'BLOCKED') {
      status = 'BLOCKED';
      summary = 'Call was blocked by security policy or analyst intervention.';
    } else if (call.status === 'FLAGGED') {
      status = 'FLAGGED';
      summary = 'Call has been flagged for security review.';
    } else if (call.status === 'TERMINATED') {
      status = 'TERMINATED';
      summary = 'Call has been terminated.';
    } else if (pendingInterventions.length > 0) {
      status = 'AWAITING_REVIEW';
      summary = 'Active intervention requires human review.';
    } else if (executedInterventions.length > 0) {
      status = 'INTERVENTION_EXECUTED';
      summary = 'Security intervention has been executed for this call.';
    } else if (call.status === 'ACTIVE') {
      status = 'ACTIVE';
      summary = 'Call is currently active.';
    } else if (call.status === 'VERIFYING') {
      status = 'VERIFYING';
      summary = 'Call is undergoing step-up verification.';
    } else if (call.status === 'INITIALIZING') {
      status = 'INITIALIZING';
      summary = 'Call is initializing.';
    }

    return {
      status,
      callStatus: call.status,
      summary,
      hasActiveInterventions: pendingInterventions.length > 0,
      pendingInterventionsCount: pendingInterventions.length,
      totalInterventionsCount: interventions.length,
    };
  }
}
