/**
 * VOXSHIELD Enterprise Webhook Dispatcher
 */

export class EnterpriseWebhookNotifier {
  public static async dispatch(endpointUrl: string, payload: Record<string, any>): Promise<boolean> {
    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
