import * as core from '@actions/core';
import { Octokit } from '@octokit/action';
import { actionContext } from 'octokit-plugin-action-context';

const OctokitWithContext = Octokit.plugin(actionContext);

export type TOctokit = InstanceType<typeof OctokitWithContext>;

const getRef = (): string => {
  const ref = process.env.GITHUB_HEAD_REF;
  if (!ref) {
    throw new Error('Missing env variable GITHUB_HEAD_REF');
  }

  return ref;
};

export function getOctokit(): TOctokit {
  return new OctokitWithContext();
}

export async function isPullRequestClosed(octokit: TOctokit): Promise<boolean> {
  const { data: pullRequest } = await octokit.pulls.get({
    ...octokit.context.repo,
    pull_number: octokit.context.issue.number,
  });

  return pullRequest.state === 'closed';
}

export async function createDeployment(octokit: TOctokit): Promise<number> {
  const ref = getRef();

  const newDeployment = await octokit.repos.createDeployment({
    ...octokit.context.repo,
    ref,
    environment: 'qa',
    description: `QA of ${ref}`,
    transient_environment: true,
    required_contexts: [],
  });

  const deploymentId = newDeployment.data.id;

  await setDeploymentStatus(
    octokit,
    deploymentId,
    'in_progress',
    'In progress'
  );

  return deploymentId;
}

export async function setDeploymentStatus(
  octokit: TOctokit,
  deploymentId: number,
  state: 'in_progress' | 'success' | 'failure' | 'inactive',
  description: string,
  environmentUrl?: string
) {
  await octokit.repos.createDeploymentStatus({
    ...octokit.context.repo,
    deployment_id: deploymentId,
    state,
    environment_url: environmentUrl,
    description,
    mediaType: {
      previews: ['flash-preview', 'ant-man-preview'],
    },
  });
}

export async function deleteDeployments(octokit: TOctokit) {
  const ref = getRef();

  const deployments = await octokit.repos.listDeployments({
    ...octokit.context.repo,
    ref,
    environment: 'qa',
  });

  await Promise.all(
    deployments.data.map((deployment) =>
      setDeploymentStatus(
        octokit,
        deployment.id,
        'inactive',
        'Destroying'
      ).then(() =>
        octokit.repos.deleteDeployment({
          ...octokit.context.repo,
          deployment_id: deployment.id,
        })
      )
    )
  );
}
