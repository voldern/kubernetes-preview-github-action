# K8S preview apps Github action

This Github action makes it easy to create PR review applications in your Kubernetes cluster.

A PR review application is a deployment that gets created with the code in the source branch of a pull request when the PR is created and destroys it when it's merged or closed.

## How it works

The action talks to the Kubernetes API using credentials and certificates that you supply to create a deployment and other resources based on specs you supply in the repository that uses this action. The action also creates a Github deployment that tracks the Kubernetes deployment.

You need to have a wildcard domain setup that points to an ingress that runs in your cluster and that forwards traffic to the right service.

![Diagram](diagram.png)

## Infrastructure setup

You need to have a K8S cluster that is available from a Github action with a kubeconfig. See [ServiceAccount](#serviceaccount) for additional details.

In addition, you need to have an ingress that takes traffic for a wildcard domain and forwards it to the correct service.

For AWS you would attach an ACM wildcard certificate to the LoadBalancer that sits in front of the ingress. For other GKE and other setups, you could use a controller like [certmanager](https://cert-manager.io/docs/) to provision a wildcard SSL certificate.

### Examples

You probably want to set up everything and run your preview applications in a dedicated namespace. Let's create one aptly named `preview`:

``` bash
kubectl create ns preview
```

#### ServiceAccount

Then you could create a service account with permission to get, create, update and delete `services` and `deployments`. An example of this can be found in [configs/auth.yaml](configs/auth.yaml).

``` bash
kubectl -n preview apply -f configs/auth.yaml
```

If you're using GKE see [Authenticating to the Kubernetes API server](https://cloud.google.com/kubernetes-engine/docs/how-to/api-server-authentication#applications_in_other_environments) and [google-github-actions/get-gke-credentials](https://github.com/google-github-actions/get-gke-credentials).

#### SSL cert

You want a wildcard SSL certificate for the ingress.

For AWS you can use an ACM wildcard certificate directly on a `LoadBalancer` if you're running the [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.3/) as described [here](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.3/guide/ingress/annotations/#ssl).

If you use GKE its not possible to provision wildcard certificates for your external ingress/load balancer. One simple way to provision one is using [certmanager](https://cert-manager.io/docs/). An **outdated** example of a configuration can be found in [configs/gke/cert.yaml](configs/gke/cert.yaml). Please note that the configuration needs to be changed to have the right domain and to work with your cluster.

#### Ingress

An example of a simple ingress based on nginx can be found in [ingress/](ingress/) and is published as a Docker image at [Dockerhub](https://hub.docker.com/r/voldern/kubernetes-preview-ingress).

To see an example of how to run the ingress on AWS with a `LoadBalancer` with an attached ACM certificate look at [configs/aws/ingress.yaml](configs/aws/ingress.yaml).

To see an **outdated** example of how to run the ingress on GKE with an external load balancer (ingress) look at [configs/gke/ingress.yaml](configs/gke/ingress.yaml).

### Helm chart

There is a Helm chart to setup the infrastructure on AWS.

You need to add this repository to your helm repositories:

``` bash
helm repo add preview https://voldern.github.io/kubernetes-preview-github-action
helm repo update
```

Install:

``` bash
helm install <RELEASE_NAME> -n preview --set ingress.certificateArn=arn:XXX --set ingress.domain=foo.bar.baz preview/preview
```

## Usage

Create a workflow in the repository of your application. For example `.github/workflows/review-app.yaml`.

### Inputs

You need a kubeconfig to be able to run the action. If you are using GKE you can get one by following the documentation at [google-github-actions/get-gke-credentials](https://github.com/google-github-actions/get-gke-credentials).

For AWS and other setups you can get the token and certificate for the service account by finding the name of the secret holding the credentials:

```bash
kubectl -n preview get secret
```

Then get the data stored in the secret:

``` bash
kubectl -n preview get secrets/preview-ci-token-XXX -o yaml
```

The `ca.crt` should be provided in its base64 encoded form while the `token` should be provided decoded from its base64 value.

Use that to generate a kubeconfig.

### Specs

You probably want to generate your Kubernetes specs somehow. [kustomize](https://kustomize.io/) is one way of doing it.

It's important that all specs in each PR have a different name and a unique set of labels.

### Example

An example of the workflow:

``` yaml
name: PR review app
on:
  pull_request:
    types:
      - opened
      - synchronize
      - reopened
jobs:
    run:
        runs-on: ubuntu-latest
        env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
        steps:
          - name: Checkout code
            uses: actions/checkout@master
          - name: Build application
            run: echo "Test and build your app"
            shell: bash
          - name: Docker login
            run: echo "Login to docker registry"
          - name: Construct docker image name
            id: vars
            run: echo "::set-output name=image::your-docker-image:qa-${GITHUB_SHA::8}"
            shell: bash
          - name: Build docker image
            run: docker build . -t ${{ steps.vars.outputs.image }}
          - name: Push docker image
            run: docker push ${{ steps.vars.outputs.image }}
          - name: Setup kustomize
            uses: imranismail/setup-kustomize@v1
          - name: Edit k8s specs
            run: |
              cd kustomize/
              kustomize edit set nameprefix pr-${{ env.PR_NUMBER }}-
              kustomize edit set label pr:${{ env.PR_NUMBER }}
          - name: Build k8s config
            run: kustomize build kustomize > specs.yml
          - uses: voldern/kubernetes-preview-github-action/deploy@vX.X.X
            with:
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
              domain: my.domain.tld
              namespace: preview
              kubeconfig: path/to/kubeconfig
              specsPath: 'specs.yml'
```

You also want to delete the applications once the PR is merge or closed. You can do that in a separate workflow, for example in `.github/workflows/cleanup.yaml`:

``` yaml
name: PR review app
on:
  pull_request:
    types:
      - closed
jobs:
    run:
        runs-on: ubuntu-latest
        steps:
          - name: Checkout code
            uses: actions/checkout@master
          - name: Setup kustomize
            uses: imranismail/setup-kustomize@v1
          - name: Edit k8s specs
            run: |
              cd kustomize/
              kustomize edit set nameprefix pr-${{ env.PR_NUMBER }}-
              kustomize edit set label pr:${{ env.PR_NUMBER }}
          - name: Build k8s config
            run: kustomize build kustomize > specs.yml
          - uses: voldern/kubernetes-preview-github-action/destroy@vX.X.X
            with:
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
              namespace: preview
              kubeconfig: path/to/kubeconfig
              specsPath: 'specs.yml'
```

