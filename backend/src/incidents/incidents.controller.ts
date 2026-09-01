import { Request, Response } from 'express';
import { z } from 'zod';
import { IncidentsService, IncidentSeverity, IncidentStatus } from './incidents.service';

const createIncidentSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  attackClassification: z.string().min(2),
  callId: z.string().uuid().optional(),
  summary: z.string().min(5),
  triggeredPolicies: z.array(z.string()).optional(),
  actionsTaken: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'FALSE_POSITIVE']),
  notes: z.string().optional(),
});

export class IncidentsController {
  public static async list(req: Request, res: Response): Promise<void> {
    const list = IncidentsService.listIncidents(req.user?.organizationId);
    res.status(200).json({
      success: true,
      data: list,
      count: list.length,
    });
  }

  public static async getById(req: Request, res: Response): Promise<void> {
    const incident = IncidentsService.getIncidentById(req.params.id);
    if (!incident) {
      res.status(404).json({
        success: false,
        error: 'INCIDENT_NOT_FOUND',
        message: `Incident ${req.params.id} does not exist`,
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: incident,
    });
  }

  public static async create(req: Request, res: Response): Promise<void> {
    const parsed = createIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    const orgId = req.user?.organizationId || '00000000-0000-0000-0000-000000000001';
    const incident = await IncidentsService.createIncident({
      organizationId: orgId,
      assignedToUserId: req.user?.id,
      ...parsed.data,
      severity: parsed.data.severity as IncidentSeverity,
    });

    res.status(201).json({
      success: true,
      data: incident,
    });
  }

  public static async updateStatus(req: Request, res: Response): Promise<void> {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    try {
      const updated = await IncidentsService.updateStatus(
        req.params.id,
        parsed.data.status as IncidentStatus,
        req.user?.id,
        parsed.data.notes
      );
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: err.message,
      });
    }
  }
}
