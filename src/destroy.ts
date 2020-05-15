import * as core from '@actions/core';
import {
  Client as KubeClient,
  getClient,
  deleteService,
  deleteDeployment,
} from './kubernetes';
import {
  TOctokit,
  getOctokit,
  deleteDeployments as deleteGithubDeployments,
} from './github';
import { exitWithError, getName } from './utils';

async function run() {
  const name = getName();
  const kubeClient = getClient('preview');
  const octokit = getOctokit();

  try {
    core.info('Deleting service');
    await deleteService(kubeClient, name);

    core.info('Deleting deployment');
    await deleteDeployment(kubeClient, name);

    core.debug('Deleting Github deployment');
    await deleteGithubDeployments(octokit, name);
  } catch (e) {
    exitWithError(e);
  }
}

run();
