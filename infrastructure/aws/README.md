# AWS infrastructure (CloudFormation)

CloudFormation templates for shared frontend infrastructure.

| File | Purpose |
| --- | --- |
| `frontend-cdn.yml` | Private S3 bucket + CloudFront distribution (OAC) hosting the SPA. |
| `github-oidc-deploy-role.yml` | IAM role GitHub Actions assumes via OIDC to sync the bucket and invalidate the distribution. |

The frontend stack must be deployed in **`us-east-1`** if you attach an ACM certificate (CloudFront only accepts certs from `us-east-1`). The bucket itself can be created in any region — what matters is that the stack's `OriginAccessControl` and `Distribution` are global resources.

## 1. Deploy the CDN stack

```bash
# Pick a globally unique bucket name and (optionally) a domain + ACM cert.
aws cloudformation deploy \
  --stack-name caresync-frontend-prod \
  --template-file infrastructure/aws/frontend-cdn.yml \
  --region us-east-1 \
  --parameter-overrides \
    BucketName=caresync-frontend-prod \
    DomainNames=app.caresync.example.com \
    AcmCertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/xxxx \
    PriceClass=PriceClass_100

# Without a custom domain, drop the DomainNames + AcmCertificateArn overrides.
```

Once the stack is `CREATE_COMPLETE`, capture the outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name caresync-frontend-prod \
  --region us-east-1 \
  --query "Stacks[0].Outputs"
```

You'll get back `BucketName`, `DistributionId`, and `DistributionDomainName`.

## 2. Deploy the GitHub OIDC role (one-time per AWS account)

```bash
aws cloudformation deploy \
  --stack-name caresync-frontend-deploy-role \
  --template-file infrastructure/aws/github-oidc-deploy-role.yml \
  --region us-east-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubOrg=vbanks-softcloud \
    GitHubRepo=CareSync \
    AllowedRefs=ref:refs/heads/main \
    FrontendBucketName=caresync-frontend-prod \
    CloudFrontDistributionArn=arn:aws:cloudfront::123456789012:distribution/EXAMPLEDISTID
```

Take the resulting role ARN and set it as the GitHub repo secret `AWS_DEPLOY_ROLE_ARN` (see [`.github/workflows/frontend-deploy.yml`](../../.github/workflows/frontend-deploy.yml)).

## 3. First-time upload

Until the GitHub Action runs, you can publish manually from the `frontend/` workspace:

```bash
cd frontend
npm run build
CARESYNC_FRONTEND_BUCKET=caresync-frontend-prod \
CARESYNC_CF_DISTRIBUTION_ID=EXAMPLEDISTID \
npm run deploy
```

The site will be live at the `DistributionDomainName` output (e.g. `d123abcdef.cloudfront.net`) within a few minutes — and at your custom domain once Route 53 / DNS points to that distribution.
