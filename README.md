# K8S preview apps Github action

This Github action makes it easy to create PR review applications in your Kubernetes cluster.

A PR review application is a deployment that gets created with the code in the source branch of a pull request when the PR is created and that destroys it when its merged or closed.

## How it works

The action talks to the Kubernetes API using credentials and certificates that you supply to create a deployment based on a template you supply in the repository that uses this action. The action also creates a Github deployment that tracks the Kubernetes deployment.

You need to have a wildcard domain setup that points to an ingress that runs in your cluster and that forwards traffic to the right service.

![Diagram](https://viewer.diagrams.net/?highlight=0000ff&edit=_blank&layers=1&nav=1&title=kubernetes-preview-github-action.drawio#R7Vldc%2BMmFP01foxHQl%2FWY%2Bx4tztNp9mmnW6fOljCEg0WKsKxvb%2B%2BFwl9IttJ48QzndoPEofLBXHPPYA0cRab%2FWeB8%2FQnHhM2QVa8nzh3E4SQi1y4KORQIbYTaCQRNNZYCzzS70SDlka3NCZFz1ByziTN%2B2DEs4xEsodhIfiub7bmrN9rjhNiAI8RZib6O41lqlHbD9uKHwhNUt31DAVVxQbXxvpJihTHfNeBnOXEWQjOZXW32S8IU7NXz0vV7tOR2mZggmTyJQ2KIFh8tX9%2B%2BjpfLyKS3qX5bw83nh6bPNQPTGJ4fl3kQqY84RlmyxadC77NYqK8WlBqbe45zwG0AfyLSHnQwcRbyQFK5YbpWhiwOHyDwo01tVAN%2FKEcTt0grIG7ve6iKh26pQci6IZIImpwT%2BW32j3cV848XWo9qcKhUxj6qaZDzcHRWdZQwbciIiemtmYrFgmRJ%2BxQwwXIIsJhNOIA7QRhWNLn%2FjiwZnPS2DVNHziFESJLp57ta9rpxHNmVt9FNX7dqqXNrRD40DHLlUFxoh806Cf0%2Biw8Zx9YJ%2B0d54324Rl7NzxlDzfVjNSlToxaqMy0V2Sdjao%2BnzHb6gAvBMGSAPbwy2hK3uMVSGsvjTCjSQb3EVBTEXj%2BTISkIF23umJD47jKWFLQ73hV%2BlMs10EF59584t01vFcOyL7HOK2runGrZt2MOK4sJq21d2tq%2B7VSHnodvpH3N8ifItfq%2FNBYL7VDvl4XRA4ifpkYu9eQ1kvr18V1yfHG9aJxUemloUtnhQRi%2FiECV%2Ffz4nENl%2BUzgvVq%2BzPjGU74wP6dBM4zBY7x4r%2Bkb1V%2BHxU42NrYDhrVnreu7PbUc8Pu70oCZ4T4M5XpdqU6jyTlmRHnGBdpK25byWhGFs2%2B3ToTfaYY8sALWvoeocX9wGDFpeSbEd5IJaZz2I%2FnamCbfaLOLtMdWTFQ22Ka6Mc4whhDS49yYLgF01sXa9ceJOrkTDtHCM86ToleEF8bMXPX8eN2RUQG%2B99CndFIzvhhQ7RediPXiUsviLuUQtsclwvJDqYRsDVlbMEZF2VTB80Cb6k2%2BYUU%2FIl0atblz0jXORwKLNCPhTX1HXVRGYwWZYVdwmiAhqNo6WJoGR5xHJStp2E44sQeYGg2sC0VZkinp2ZqpzRSfJzn4kt5c1dNtGoDM0ez5NdycQ%2BsUzr1ctYZK2yAXkQ7d%2FZOtJtdYyPUnDH1KbA5Yf6b0%2BUFd1X%2B5GNOhW%2BKmG8IxQT5TCoO9wLp%2F71Vby%2FmSshvai7dgomtCOa1BnCXqOuXLIG1uqi9weDyuup%2FzXlXzSG5oTfoffSmEZdr6U14Zb1RTOq904LIX1d0gheKjn9N0QmOik5Mn2uVWO5hgiAuYMg4juGywgxnEcxaqykde4MKZt7bVXrqazdxZ%2Bdq9LVTU3sza9CYNoxhgQlqCfJGwDEsGPYdjEnKqMyMgKMuR%2Fq2BoMsFers3ryTQuPbdFzk1flgTfcqQc2DQRlSIpbPpIqsPaKMES0ibodTUfpqZVGR6M%2BGQsZC8ulW%2FccWEkhyK3Auo6DIGiqoZyio737gQcG2jbz5UAnty6d3ZfWsP0Wdlc%2FgmvJZj7Knn8MgMkbzgnTyI2J8G9ebqsf%2Bpsp4rfgmkrten%2BNuYHB8NrJL8P1XzxcU269q1duO9uOks%2FwH)

## Setup

You need to have a K8S cluster that is publicly available and authenticates using a certificate and a token for a service account with the right permissions.

In addition you need to have an ingress that takes traffic for a wildcard domain and redirects to the correct service.

You probably also want a controller like [certmanager](https://cert-manager.io/docs/) to generate SSL certificates.

### Examples

You probably want to setup everything and run your preview applications in a dedicated namespace. Lets create one aptly named `preview`:

``` bash
kubectl create ns preview
```

#### ServiceAccount

Then create a service account with permission to get, create, update and delete `services` and `deployments`. An example of this can be found in [configs/auth.yaml](configs/auth.yaml).

``` bash
kubectl -n preview apply -f configs/auth.yaml
```

#### SSL cert

You want a wildcard SSL certificate for the ingress.

If you use GKE you can not provision wildcard certificates for your external ingress/load balancer, a simple way to provision one is using [certmanager](https://cert-manager.io/docs/). An example of a configuration can be found in [configs/cert.yaml]. Please note that the configuration need to be changed to have the right domain and to work with your cluster.

If you're using AWS EKS [it seems like](https://aws.amazon.com/premiumsupport/knowledge-center/terminate-https-traffic-eks-acm/) you can use an ACM certificate directly on a service with the `LoadBalancer` `type`.

#### Ingress

An example of a simple ingress based on nginx can be found in [ingress/](ingress/) and is published as a Docker image at [url](url).

To see an example of how to run the ingress on GKE with an external load balancer (ingress) look at [configs/ingress.yaml](configs/ingress.yaml).

For AWS EKS you would use the `LoadBalancer` as described above instead of the `Ingress`.
