import * as core from '@actions/core';
import * as github from '@actions/github';
import { HttpError as KubeHttpError } from '@kubernetes/client-node';

export function exitWithError(error: KubeHttpError | Error) {
  let errorMsg;
  if (error instanceof KubeHttpError) {
    errorMsg = (error.response as any).body.message;
  } else {
    errorMsg = error;
  }

  core.setFailed(`Failed with error ${errorMsg}`);
}

export function getName(): string {
  const prefix = core.getInput('prefix', { required: true });
  return `${prefix}-${github.context.issue.number}`;
}
