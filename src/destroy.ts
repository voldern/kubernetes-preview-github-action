import * as core from '@actions/core';
import {
  deleteDeployments as deleteGithubDeployments,
  getOctokit,
} from './github';
import { deleteSpecs, getClient } from './kubernetes';
import { exitWithError, getDeploymentName, loadSpecs } from './utils';

async function run() {
  const specsPath = core.getInput('specsPath', { required: true });
  const specs = loadSpecs(specsPath);

  const kubeClient = getClient();
  const octokit = getOctokit();

  try {
    const deploymentName = getDeploymentName(specs);

    core.info('Deleting Kubernetes objects');
    await deleteSpecs(kubeClient, specs);

    core.info('Deleting Github deployment');
    await deleteGithubDeployments(octokit, deploymentName);
  } catch (e) {
    exitWithError(e as any);
  }
}

run();
