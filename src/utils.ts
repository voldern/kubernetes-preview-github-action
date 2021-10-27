import * as core from '@actions/core';
import * as k8s from '@kubernetes/client-node';
import { HttpError as KubeHttpError } from '@kubernetes/client-node';
import * as fs from 'fs';
import * as path from 'path';

export function loadSpecs(specsPath: string): k8s.KubernetesObject[] {
  const file = fs.readFileSync(path.join(process.cwd(), specsPath));

  return k8s.loadAllYaml(file.toString());
}

export function getDeploymentName(specs: k8s.KubernetesObject[]): string {
  const deployment = specs.filter((spec) => spec.kind === 'Deployment');
  if (deployment.length > 1) {
    throw new Error('Can not deploy several deployments');
  }

  if (!deployment.length) {
    throw new Error('Found no deployment in specs');
  }

  return (deployment[0].metadata as any).name;
}

export function exitWithError(error: KubeHttpError | Error) {
  let errorMsg;
  if (error instanceof KubeHttpError) {
    errorMsg = (error.response as any).body.message;
  } else {
    errorMsg = error;
  }

  if (core.isDebug()) {
    console.log('Error', error);
  }

  core.setFailed(`Failed with error ${errorMsg}`);
}
