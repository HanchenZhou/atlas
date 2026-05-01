export type PlanTask = {
  id: string;
  title: string;
  hint?: string;
};

export type PlanResult =
  | { kind: 'direct' }
  | { kind: 'tasks'; tasks: PlanTask[] };

export type TaskRecord = {
  id: string;
  title: string;
  hint?: string;
  status: 'done' | 'failed';
  result: string;
};
