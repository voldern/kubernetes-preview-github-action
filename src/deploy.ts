import * as core from '@actions/core';
import {
  createDeployment as createGithubDeployment,
  deleteDeployments as deleteGithubDeployments,
  getOctokit,
  isPullRequestClosed,
  setDeploymentStatus,
} from './github';
import {
  applySpecs,
  deploymentExists,
  getClient,
  waitForDeployment,
} from './kubernetes';
import { exitWithError, getDeploymentName, loadSpecs } from './utils';

async function run() {
  const domain = core.getInput('domain', { required: true });
  const specsPath = core.getInput('specsPath', { required: true });

  const kubeClient = getClient('preview');
  const octokit = getOctokit();

  const specs = loadSpecs(specsPath);

  let deploymentId;
  try {
    const deploymentName = getDeploymentName(specs);

    core.debug('Checking if PR is closed');
    const isPrClosed = await isPullRequestClosed(octokit);
    if (isPrClosed) {
      exitWithError(new Error('Can not deploy closed pr'));
      return;
    }

    core.debug('Checking if deployments exists');
    const exists = await deploymentExists(kubeClient, deploymentName);
    if (exists) {
      core.info('Updating existing deployment');

      core.debug('Deleting existing Github deployments');
      await deleteGithubDeployments(octokit, deploymentName);

      core.debug('Creating Github deployment');
      deploymentId = await createGithubDeployment(octokit, deploymentName);

      core.debug('Updating K8S deployment');
      await applySpecs(kubeClient, specs);
    } else {
      core.info('Creating new deployment');

      core.debug('Creating Github deployment');
      deploymentId = await createGithubDeployment(octokit, deploymentName);

      core.debug('Creating K8S deployment');
      await applySpecs(kubeClient, specs);
    }

    core.info('Waiting for deployment to be ready');

    await waitForDeployment(kubeClient, deploymentName);

    core.debug('Setting deployment status to success');
    await setDeploymentStatus(
      octokit,
      deploymentId,
      'success',
      'Success',
      `https://${deploymentName}.${domain}`
    );
  } catch (e) {
    if (deploymentId) {
      core.debug('Setting deployment status to failure');
      await setDeploymentStatus(octokit, deploymentId, 'failure', 'Failed');
    }

    exitWithError(e as any);
  }
}

run();
