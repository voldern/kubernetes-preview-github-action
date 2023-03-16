import * as core from '@actions/core';
import * as k8s from '@kubernetes/client-node';

export interface Client {
  v1: k8s.CoreV1Api;
  appsV1: k8s.AppsV1Api;
  objectApi: k8s.KubernetesObjectApi;
  namespace: string;
}

export function getClient(): Client {
  core.setSecret('kubeconfig');

  const namespace = core.getInput('namespace', { required: true });
  const kubeconfig = core.getInput('kubeconfig', { required: true });

  const kc = new k8s.KubeConfig();
  kc.loadFromFile(kubeconfig);

  return {
    v1: kc.makeApiClient(k8s.CoreV1Api),
    appsV1: kc.makeApiClient(k8s.AppsV1Api),
    objectApi: kc.makeApiClient(k8s.KubernetesObjectApi),
    namespace,
  };
}

export async function getDeployments(
  client: Client
): Promise<k8s.V1DeploymentList> {
  const response = await client.appsV1.listNamespacedDeployment(
    client.namespace
  );

  return response.body;
}

export async function deploymentExists(
  client: Client,
  name: string
): Promise<boolean> {
  try {
    await client.appsV1.readNamespacedDeployment(name, client.namespace);

    // If no exception is thrown some deployment exists
    return true;
  } catch (e) {
    console.log('Fail', e);
    if (e.response.body.code === 404) {
      return false;
    }

    throw e;
  }
}

export async function applySpecs(
  client: Client,
  specs: k8s.KubernetesObject[]
) {
  const validSpecs = specs.filter((s) => s && s.kind && s.metadata);

  for (const spec of validSpecs) {
    // this is to convince the old version of TypeScript that metadata exists even though we already filtered specs
    // without metadata out
    spec.metadata = spec.metadata || {};
    spec.metadata.annotations = spec.metadata.annotations || {};

    delete spec.metadata.annotations[
      'kubectl.kubernetes.io/last-applied-configuration'
    ];
    spec.metadata.annotations[
      'kubectl.kubernetes.io/last-applied-configuration'
    ] = JSON.stringify(spec);

    try {
      // try to get the resource, if it does not exist an error will be thrown and we will end up in the catch
      // block.
      await client.objectApi.read(spec);
      // we got the resource, so it exists, so patch it
      await client.objectApi.patch(spec);
    } catch (e) {
      // we did not get the resource, so it does not exist, so create it
      await client.objectApi.create(spec);
    }
  }
}

export async function deleteSpecs(
  client: Client,
  specs: k8s.KubernetesObject[]
) {
  const validSpecs = specs.filter((s) => s && s.kind && s.metadata);

  for (const spec of validSpecs) {
    await client.objectApi.delete(spec);
  }
}

export async function waitForDeployment(client: Client, name: string) {
  while (true) {
    const response = await client.appsV1.readNamespacedDeployment(
      name,
      client.namespace
    );

    if (
      response.body.status &&
      !response.body.status.unavailableReplicas &&
      response.body.status.availableReplicas
    ) {
      return;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}
