import * as core from '@actions/core';
import * as k8s from '@kubernetes/client-node';

export interface Client {
  v1: k8s.CoreV1Api;
  appsV1: k8s.AppsV1Api;
  namespace: string;
}

export function getClient(namespace: string): Client {
  core.setSecret('server');
  core.setSecret('token');
  core.setSecret('cert');

  const server = core.getInput('server', { required: true });
  const cert = core.getInput('cert', { required: true });
  const token = core.getInput('token', { required: true });

  const config = {
    clusters: [
      {
        name: 'cluster',
        server,
        caData: cert,
      },
    ],
    contexts: [
      {
        name: 'context',
        cluster: 'cluster',
        user: 'preview-ci',
      },
    ],
    currentContext: 'context',
    users: [
      {
        name: 'preview-ci',
        token,
      },
    ],
  };

  const kc = new k8s.KubeConfig();
  kc.loadFromOptions(config);

  return {
    v1: kc.makeApiClient(k8s.CoreV1Api),
    appsV1: kc.makeApiClient(k8s.AppsV1Api),
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

    // If no exception is thrown the namespace exists
    return true;
  } catch (e) {
    if (e.response.body.code === 404) {
      return false;
    }

    throw e;
  }
}

export async function createDeployment(
  client: Client,
  body: k8s.V1Deployment
): Promise<k8s.V1Deployment> {
  const response = await client.appsV1.createNamespacedDeployment(
    client.namespace,
    body
  );

  return response.body;
}

export async function updateDeployment(
  client: Client,
  name: string,
  body: k8s.V1Deployment
): Promise<k8s.V1Deployment> {
  const response = await client.appsV1.replaceNamespacedDeployment(
    name,
    client.namespace,
    body
  );

  return response.body;
}

export async function createService(
  client: Client,
  name: string,
  targetPort: number
): Promise<k8s.V1Service> {
  const response = await client.v1.createNamespacedService(client.namespace, {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name,
      labels: {
        app: name,
      },
    },
    spec: {
      type: 'NodePort',
      selector: {
        app: name,
      },
      ports: [
        {
          port: 80,
          protocol: 'TCP',
          targetPort: targetPort as Object,
        },
      ],
    },
  });

  return response.body;
}

export async function deleteDeployment(client: Client, name: string) {
  await client.appsV1.deleteNamespacedDeployment(name, client.namespace);
}

export async function deleteService(client: Client, name: string) {
  await client.v1.deleteNamespacedService(name, client.namespace);
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
