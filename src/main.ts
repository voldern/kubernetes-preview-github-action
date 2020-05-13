import * as path from 'path';
import * as fs from 'fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as jsyaml from 'js-yaml';
import { HttpError as KubeHttpError } from '@kubernetes/client-node';
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
  deleteService,
  deleteDeployment,
} from './kubernetes';
import {
  TOctokit,
  getOctokit,
  createDeployment as createGithubDeployment,
  deleteDeployments as deleteGithubDeployments,
  setDeploymentStatus,
  isPullRequestClosed,
} from './github';

interface Inputs {
  domain: string;
  prefix: string;
  server: string;
  token: string;
  cert: string;
  image: string;
}

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

function getInputs(): Inputs {
  core.setSecret('repo-token');
  core.setSecret('server');
  core.setSecret('token');
  core.setSecret('cert');

  return {
    domain: core.getInput('domain', { required: true }),
    prefix: core.getInput('prefix', { required: true }),
    server: core.getInput('server', { required: true }),
    token: core.getInput('token', { required: true }),
    cert: core.getInput('cert', { required: true }),
    image: core.getInput('image', { required: true }),
  };
}

function exitWithError(error: KubeHttpError | Error) {
  let errorMsg;
  if (error instanceof KubeHttpError) {
    errorMsg = (error.response as any).body.message;
  } else {
    errorMsg = error;
  }

  core.setFailed(`Failed with error ${errorMsg}`);
}

async function runCleanup(
  kubeClient: KubeClient,
  octokit: TOctokit,
  name: string
) {
  try {
    core.info('Deleting service');
    await deleteService(kubeClient, name);

    core.info('Deleting deployment');
    await deleteDeployment(kubeClient, name);

    core.debug('Deleting Github deployment');
    await deleteGithubDeployments(octokit);
  } catch (e) {
    exitWithError(e);
  }
}

async function runDeployment(
  kubeClient: KubeClient,
  octokit: TOctokit,
  name: string,
  image: string,
  domain: string
) {
  const manifest = loadManifest('manifest.yaml');
  const jsonManifest = buildDeploymentManifest(manifest, name, image);

  let deploymentId;
  try {
    core.debug('Checking if deployment exists');
    const exists = await deploymentExists(kubeClient, name);
    if (exists) {
      core.info('Updating existing deployment');

      core.debug('Deleting existing Github deployments');
      await deleteGithubDeployments(octokit);

      core.debug('Creating Github deployment');
      deploymentId = await createGithubDeployment(octokit);

      core.debug('Updating K8S deployment');
      await updateDeployment(kubeClient, name, jsonManifest);
    } else {
      core.info('Creating new deployment');

      core.debug('Creating Github deployment');
      deploymentId = await createGithubDeployment(octokit);

      core.debug('Creating K8S deployment');
      await createDeployment(kubeClient, jsonManifest);
      core.debug('Creating K8S service');
      await createService(kubeClient, name, 80);
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

async function run(): Promise<void> {
  const { domain, prefix, server, token, cert, image } = getInputs();

  const name = `${prefix}-${github.context.issue.number}`;

  const kubeClient = getClient(server, cert, token, 'preview');
  const octokit = getOctokit();

  const isPrClosed = await isPullRequestClosed(octokit);
  if (isPrClosed) {
    return runCleanup(kubeClient, octokit, name);
  }

  return runDeployment(kubeClient, octokit, name, image, domain);
}

run();
