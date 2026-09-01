# VOXSHIELD Speaker Biometric Security & Privacy Policy

## 1. Biometric Data Protection Principles
1. **Zero Raw Audio Storage**: Raw reference speech recordings are analyzed in-memory during enrollment and immediately discarded.
2. **One-Way Mathematical Embedding**: Only normalized 128-dimensional acoustic x-vectors are stored. The original speech content cannot be reconstructed from these vector projections.
3. **Role-Based Biometric Access**:
   - Enrollment & Profile Deletion: Restricted strictly to `ADMIN` and `SUPERVISOR` roles.
   - Verification Matching: Authorized for `OPERATOR` and `SECURITY_ANALYST` roles.
   - Raw Embedding Inspection: Prohibited for standard operator interfaces.
4. **Anti-Spoof Enrollment Gating**: Every candidate reference utterance must pass acoustic signal quality and deepfake anti-spoof screening before profile creation to prevent enrollment poisoning.
5. **Right to Deletion**: Immediate biometric profile purging via `DELETE /api/speakers/:id`.
