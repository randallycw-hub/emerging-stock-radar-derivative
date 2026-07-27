export class RepositoryError extends Error { readonly code: string; constructor(code: string, message = code) { super(message); this.code = code; this.name = "RepositoryError"; } }
