export class HintError extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 2,
  ) {
    super(message);
    this.name = 'HintError';
  }
}

export const validationError = (message: string): HintError =>
  new HintError(message, 1);

export const resolutionError = (message: string): HintError =>
  new HintError(message, 2);
