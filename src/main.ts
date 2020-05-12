import * as path from 'path';
import * as fs from 'fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
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

    await deleteGithubDeployments(octokit);
  } catch (e) {
    core.setFailed(`Failed with error ${e}`);
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
    const exists = await deploymentExists(kubeClient, name);
    if (exists) {
      core.info('Updating existing deployment');

      await deleteGithubDeployments(octokit);
      deploymentId = await createGithubDeployment(octokit);

      await updateDeployment(kubeClient, name, jsonManifest);
    } else {
      core.info('Creating new deployment');

      deploymentId = await createGithubDeployment(octokit);

      await createDeployment(kubeClient, jsonManifest);
      await createService(kubeClient, name, 80);
    }

    core.info('Waiting for deployment to be ready');

    await waitForDeployment(kubeClient, name);

    await setDeploymentStatus(
      octokit,
      deploymentId,
      'success',
      'Success',
      `https://${name}.${domain}`
    );
  } catch (e) {
    if (deploymentId) {
      await setDeploymentStatus(octokit, deploymentId, 'failure', 'Failed');
    }

    core.setFailed(`Failed with error ${e}`);
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
