"""
Multi-Turn Claim Inconsistency & Contradiction Verifier (Context Subsystem)
Re-exports InconsistencyVerifier for the context subsystem.
"""

from ai.app.claims.verifier import (
    ConversationInconsistencyVerifier,
    InconsistencyVerifier,
)

__all__ = ["InconsistencyVerifier", "ConversationInconsistencyVerifier"]
