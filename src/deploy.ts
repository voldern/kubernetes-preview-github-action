import * as path from 'path';
import * as fs from 'fs';
import * as core from '@actions/core';
import * as jsyaml from 'js-yaml';
import merge from 'deepmerge';
import {
  Client as KubeClient,
  getClient,
  createDeployment,
  updateDeployment,
  getDeployments,
  createService,
  deploymentExists,
  waitForDeployment,
} from './kubernetes';
import {
  TOctokit,
  getOctokit,
  createDeployment as createGithubDeployment,
  deleteDeployments as deleteGithubDeployments,
  setDeploymentStatus,
  isPullRequestClosed,
} from './github';
import { exitWithError, getName } from './utils';

function loadManifest(manifestPath: string): string {
  const file = fs.readFileSync(path.join(process.cwd(), manifestPath));
  return file.toString();
}

function buildDeploymentManifest(
  manifest: string,
  name: string,
  image: string
): Object {
  if (!manifest.includes('__IMAGE__')) {
    throw new Error('Manifest does not include __IMAGE__ placeholder');
  }

  const jsonManifest = jsyaml.safeLoad(manifest.replace('__IMAGE__', image));

  return merge(jsonManifest, {
    metadata: {
      name,
      labels: {
        app: name,
      },
    },
    spec: {
      selector: {
        matchLabels: {
          app: name,
        },
      },
      template: {
        metadata: {
          labels: {
            app: name,
          },
        },
      },
    },
  });
}

async function run() {
  const name = getName();
  const image = core.getInput('image', { required: true });
  const domain = core.getInput('domain', { required: true });
  const port = core.getInput('targetPort') || '80';

  const kubeClient = getClient('preview');
  const octokit = getOctokit();

  const manifest = loadManifest('manifest.yaml');
  const jsonManifest = buildDeploymentManifest(manifest, name, image);

  let deploymentId;
  try {
    core.debug('Checking if PR is closed');
    const isPrClosed = await isPullRequestClosed(octokit);
    if (isPrClosed) {
      exitWithError(new Error('Can not deploy closed pr'));
      return;
    }

    core.debug('Checking if deployment exists');
    const exists = await deploymentExists(kubeClient, name);
    if (exists) {
      core.info('Updating existing deployment');

      core.debug('Deleting existing Github deployments');
      await deleteGithubDeployments(octokit, name);

      core.debug('Creating Github deployment');
      deploymentId = await createGithubDeployment(octokit, name);

      core.debug('Updating K8S deployment');
      await updateDeployment(kubeClient, name, jsonManifest);
    } else {
      core.info('Creating new deployment');

      core.debug('Creating Github deployment');
      deploymentId = await createGithubDeployment(octokit, name);

      core.debug('Creating K8S deployment');
      await createDeployment(kubeClient, jsonManifest);
      core.debug('Creating K8S service');
      await createService(kubeClient, name, port);
    }

    core.info('Waiting for deployment to be ready');

    await waitForDeployment(kubeClient, name);

    core.debug('Setting deployment status to success');
    await setDeploymentStatus(
      octokit,
      deploymentId,
      'success',
      'Success',
      `https://${name}.${domain}`
    );
  } catch (e) {
    if (deploymentId) {
      core.debug('Setting deployment status to failure');
      await setDeploymentStatus(octokit, deploymentId, 'failure', 'Failed');
    }

    exitWithError(e);
  }
}

run();
