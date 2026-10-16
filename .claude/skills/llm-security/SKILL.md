---
name: llm-security
description: Security review guidance for applications using LLMs, RAG, embeddings, agent tools, MCP/connectors, memory, or model-generated actions. Use for AI/agentic systems and whenever untrusted content can influence a model that has data or tool access.
---

# LLM and agent security

Model output is untrusted data. Prompts are policy hints, not authorization boundaries. Security controls must live in deterministic code around the model.

## Review model

1. Map every untrusted-content path into the model: user text, web pages, files, email, RAG chunks, images, tool results, memory, peer agents and connectors.
2. Map every model-controlled sink: tool calls, filesystem, shell, network, databases, messages, purchases, deployment, privileged APIs and persistent memory.
3. Minimize agency: expose only necessary tools, parameters, records and scopes. Separate read from write/destructive capabilities.
4. Enforce authorization and argument validation outside the model. Never rely on the system prompt to protect secrets or prohibit privileged actions.
5. Treat retrieved/tool content as data, not instructions. Preserve provenance and distinguish trusted policy from untrusted context.
6. Validate and safely encode model output before it reaches interpreters, HTML, SQL, shell, code execution, URLs or downstream APIs.
7. Protect sensitive information: minimize prompt/context data, redact logs, bound tool responses, and prevent cross-user/tenant memory or retrieval leakage.
8. Design confirmation gates for consequential or irreversible actions and make ambiguous outcomes safe to recover from.
9. Bound cost and resource use: turns, tool calls, tokens, retrieval size, recursion, retries, file sizes and concurrency.
10. Test direct and indirect prompt injection, malicious retrieved content, poisoned memory/data, tool-output manipulation, privilege escalation and denial-of-wallet paths.

Use the current OWASP GenAI/LLM guidance when detailed risk taxonomy is needed; the 2025 list includes prompt injection, sensitive-information disclosure, supply-chain risks, data/model poisoning, improper output handling, excessive agency, prompt leakage, vector/embedding weaknesses, misinformation and unbounded consumption.

## Evidence

For each finding state the untrusted source, model decision point, deterministic guard (or lack of one), sensitive sink, impact, and proposed control. Separate application-level vulnerabilities from model-quality concerns.
