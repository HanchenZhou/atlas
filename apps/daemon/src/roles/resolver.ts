export type RoleConfig = {
  providerId?: string;
  model?: string;
};

export class RoleResolver {
  constructor(
    private readonly defaults: RoleConfig,
    private readonly roles: Record<string, RoleConfig>,
  ) {}

  resolve(name: string): RoleConfig {
    const role = this.roles[name] ?? {};
    const out: RoleConfig = {};
    const providerId = role.providerId ?? this.defaults.providerId;
    const model = role.model ?? this.defaults.model;
    if (providerId !== undefined) out.providerId = providerId;
    if (model !== undefined) out.model = model;
    return out;
  }
}
