# VOXSHIELD: Attack Taxonomy & Matrix

## 1. Multi-Tiered Attack Classification Matrix

VOXSHIELD classifies attacks across four independent orthogonal dimensions:

```
Dimension 1: Signal & Acoustic Integrity (How the voice is generated)
Dimension 2: Identity & Persona (Who is being claimed)
Dimension 3: Conversational Strategy (How the victim is manipulated)
Dimension 4: Target Objective / Payload (What the attacker seeks to achieve)
```

---

## 2. Taxonomy Breakdown

### Tier 1: Signal / Acoustic Layer (`SIG_*`)
- `SIG_TTS_PARAMETRIC`: Classical acoustic vocoder synthesis.
- `SIG_TTS_NEURAL`: Modern diffusion, autoregressive, or flow-matching TTS models (e.g., ElevenLabs, XTTS, VALL-E).
- `SIG_VOICE_CONVERSION_OFFLINE`: Pre-rendered converted audio.
- `SIG_VOICE_CONVERSION_REALTIME`: Real-time streaming voice conversion with low algorithmic latency (<200ms).
- `SIG_REPLAY_PHYSICAL`: Physical acoustic replay of genuine speaker recordings.
- `SIG_REPLAY_DIGITAL`: Direct injection of captured audio stream.
- `SIG_SPLICING_CONCATENATION`: Spliced composite audio segments.
- `SIG_HYBRID_SPEECH`: Synthetic foreground voice over real acoustic background.
- `SIG_ADVERSARIAL_PERTURBATION`: Audio containing targeted noise designed to disrupt acoustic classifiers.

### Tier 2: Identity & Spoofing Layer (`ID_*`)
- `ID_EXECUTIVE_IMPERSONATION`: Claiming executive / C-suite authority (CEO, CFO, Board member).
- `ID_CLIENT_IMPERSONATION`: Claiming existing customer or client identity for unauthorized transactions.
- `ID_HELPDESK_IT_IMPERSONATION`: Claiming internal technical support or sysadmin identity.
- `ID_LEGAL_REGULATORY_IMPERSONATION`: Claiming external legal counsel, auditor, or government agency.
- `ID_SUPPLIER_VENDOR_IMPERSONATION`: Claiming supply chain partner or vendor accounts department.
- `ID_UNKNOWN_CALLER_SPOOF`: Spoofing internal extension or caller ANI.

### Tier 3: Social Engineering & Behavioral Tactics (`SE_*`)
- `SE_URGENCY_INDUCEMENT`: Artificial time pressure to prevent deliberate thought.
- `SE_COERCION_INTIMIDATION`: Threats of discipline, litigation, or public embarrassment.
- `SE_SECRECY_CONFINEMENT`: Demanding non-disclosure to peers or supervisors.
- `SE_POLICY_EXCEPTION_REQUEST`: Fabricating special circumstances to override established SOPs.
- `SE_FAMILIARITY_BUILDING`: Leveraging OSINT details to establish rapid false rapport.
- `SE_EMOTIONAL_EXPLOITATION`: Fabricating personal distress, illness, or emergency.

### Tier 4: Objective & Requested Action (`OBJ_*`)
- `OBJ_CREDENTIAL_HARVEST_OTP`: Soliciting SMS/Email one-time passwords.
- `OBJ_CREDENTIAL_HARVEST_PASSWORD`: Soliciting account passwords, PINs, or security answers.
- `OBJ_MFA_DEVICE_REBIND`: Requesting registration of new 2FA hardware/software tokens.
- `OBJ_WIRE_TRANSFER_UNAUTHORIZED`: Requesting urgent one-off funds transfer.
- `OBJ_BENEFICIARY_MODIFICATION`: Updating payment banking details for existing payees.
- `OBJ_PAYROLL_DIVERT`: Directing salary/compensation to a new routing address.
- `OBJ_DATA_EXFILTRATION`: Requesting confidential corporate customer or employee records.

---

## 3. Threat Level Mapping & Escalation Logic
Each classified attack vector maps directly to deterministic severity and policy response matrices:

```
[ ASR + NLP Intent Classifier ]  ---> [ Identified OBJ_* & SE_* ]
                                                 |
[ Acoustic & Biometric Engines]  ---> [ Identified SIG_* & ID_* ]
                                                 |
                                                 v
                                   [ Unified Threat Classification ]
                                                 |
                       +-------------------------+-------------------------+
                       |                         |                         |
               Score < 0.35              0.35 <= Score < 0.70         Score >= 0.70
                 [ LOW ]                      [ MEDIUM ]             [ HIGH / CRITICAL ]
               Action: ALLOW             Action: STEP-UP VERIFY      Action: BLOCK & ISOLATE
```
