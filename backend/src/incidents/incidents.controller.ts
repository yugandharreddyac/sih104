import { Request, Response } from 'express';
import { z } from 'zod';
import { IncidentsService, IncidentSeverity, IncidentStatus } from './incidents.service';
import { RoleName, Permission } from '../auth/types';

const createIncidentSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  attackClassification: z.string().min(2),
  callId: z.string().optional(),
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
    const isGlobalAdmin = req.user?.role === RoleName.ADMIN || (req.user?.permissions && req.user.permissions.includes(Permission.ALL));
    const list = IncidentsService.listIncidents(isGlobalAdmin ? undefined : req.user?.organizationId);
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

    const isGlobalAdmin = req.user?.role === RoleName.ADMIN || (req.user?.permissions && req.user.permissions.includes(Permission.ALL));
    if (!isGlobalAdmin && req.user?.organizationId && incident.organizationId !== req.user.organizationId) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Access to incident from another organization is denied',
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
      const isGlobalAdmin = req.user?.role === RoleName.ADMIN || (req.user?.permissions && req.user.permissions.includes(Permission.ALL));
      const updated = await IncidentsService.updateStatus(
        req.params.id,
        parsed.data.status as IncidentStatus,
        req.user?.id,
        parsed.data.notes,
        req.user?.organizationId,
        isGlobalAdmin
      );
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      const status = err.statusCode || 400;
      res.status(status).json({
        success: false,
        error: err.code || 'ERROR',
        message: err.message,
      });
    }
  }
}
