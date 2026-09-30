import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const Mixed = Schema.Types.Mixed;

const incidentSchema = new Schema(
  {
    number: { type: String, unique: true },
    title: String,
    severity: { type: String, enum: ['SEV1', 'SEV2', 'SEV3'] },
    status: {
      type: String,
      enum: ['investigating', 'awaiting_approval', 'executing', 'verifying', 'needs_human', 'resolved', 'escalated', 'out_of_scope'],
      default: 'investigating',
    },
    source: { type: String, enum: ['alert', 'manual'], default: 'alert' },
    description: String,
    services: [String],
    alerts: [{ at: Date, service: String, message: String, _id: false }],
    mode: { type: String, enum: ['agent', 'fallback'], default: 'agent' },
    diagnosis: Mixed,
    proposedAction: Mixed,
    decisions: [{ at: Date, by: String, decision: String, reason: String, action: Mixed, _id: false }],
    attempts: { type: Number, default: 0 },
    verification: Mixed,
    closingNote: String,
    report: Mixed,
    usage: { inputTokens: Number, outputTokens: Number, usd: Number, llmCalls: Number, models: [String] },
    openedAt: { type: Date, default: Date.now },
    diagnosedAt: Date,
    resolvedAt: Date,
  },
  { timestamps: true },
);

// Every step the agent (or a human) takes on an incident. Collection name per CLAUDE.md.
const stepSchema = new Schema(
  {
    incident: { type: Schema.Types.ObjectId, ref: 'Incident', index: true },
    seq: Number,
    at: { type: Date, default: Date.now },
    kind: { type: String, enum: ['alert', 'plan', 'tool', 'event', 'conclusion', 'gate', 'decision', 'action', 'verify', 'report', 'error', 'note'] },
    title: String,
    detail: String,
    tool: String,
    input: Mixed,
    hypotheses: Mixed,
    output: Mixed,
    isError: Boolean,
    latencyMs: Number,
    tokens: { input: Number, output: Number },
  },
  { collection: 'agent_runs' },
);

const actionSchema = new Schema(
  {
    incident: { type: Schema.Types.ObjectId, ref: 'Incident', index: true },
    type: String,
    target: String,
    params: Mixed,
    risk: String,
    idempotencyKey: { type: String, unique: true },
    jti: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ['pending', 'waiting_for_lock', 'executed', 'failed'], default: 'pending' },
    approvedBy: String,
    result: String,
    executedAt: Date,
  },
  { timestamps: true },
);

const lockSchema = new Schema({
  resource: { type: String, unique: true },
  holder: String,
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
});

const memorySchema = new Schema({
  number: String,
  date: String,
  title: String,
  services: [String],
  category: String,
  rootCause: String,
  fix: String,
  summary: String,
});
memorySchema.index({ title: 'text', rootCause: 'text', summary: 'text', services: 'text', category: 'text' });

const auditSchema = new Schema({
  at: { type: Date, default: Date.now, index: true },
  actor: String,
  action: String,
  incident: String,
  detail: String,
});

const benchmarkSchema = new Schema(
  {
    batch: { type: String, index: true },
    scenario: String,
    seed: Number,
    diagnoser: { type: String, enum: ['agent', 'baseline'] },
    expected: Mixed,
    diagnosis: Mixed,
    correctCause: Boolean,
    correctAction: Boolean,
    wrongAction: Boolean,
    recovered: Boolean,
    diagnosisMs: Number,
    steps: Number,
    usd: Number,
    tokens: Number,
    error: String,
  },
  { timestamps: true },
);

const userSchema = new Schema({
  username: { type: String, unique: true, lowercase: true, trim: true },
  name: String,
  role: { type: String, enum: ['approver', 'responder'] },
  passwordHash: String,
});

// Signed-out session tokens, kept until they would have expired anyway.
const revokedTokenSchema = new Schema({ jti: { type: String, unique: true }, expiresAt: { type: Date, index: { expireAfterSeconds: 0 } } });

const settingSchema = new Schema({ key: { type: String, unique: true }, value: Mixed }, { timestamps: true });

export const User = model('User', userSchema);
export const RevokedToken = model('RevokedToken', revokedTokenSchema, 'revoked_tokens');
export const Setting = model('Setting', settingSchema);
export const Incident = model('Incident', incidentSchema);
export const AgentStep = model('AgentStep', stepSchema);
export const Action = model('Action', actionSchema);
export const Lock = model('Lock', lockSchema);
export const IncidentMemory = model('IncidentMemory', memorySchema, 'incident_memory');
export const AuditLog = model('AuditLog', auditSchema, 'audit_log');
export const BenchmarkRun = model('BenchmarkRun', benchmarkSchema, 'benchmark_runs');
