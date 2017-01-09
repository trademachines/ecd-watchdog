# ECD Watchdog [![Build Status](https://travis-ci.org/trademachines/ecd-watchdog.svg?branch=master)](https://travis-ci.org/trademachines/ecd-watchdog) [![Coverage Status](https://coveralls.io/repos/github/trademachines/ecd-watchdog/badge.svg?branch=master)](https://coveralls.io/github/trademachines/ecd-watchdog?branch=master)

# Motivation
Monitoring the deployment status of an AWS ECS change is unfortunately not a one-off thing. Therefore
we where not able to do this with our deployment tool itself, but needed a separate, more sophisticated
service to do the work for us. That's it why we have this tool now. 

# How it works
When a deployment is successfully initiated, we fire an event that is received by the Watchdog service.
We then check all the tasks that are started or stopped for that service and set the the state of
that deployment accordingly, finally resulting in a successful, failed or even hanging deployment. 

# Installation
We are using a [Terraform module](/trademachines/tf-ecd) to provision the resources and Travis to deploy
the code to AWS Lambda. Convenient and straightforward.
