module.exports.TableName = 'ecd-watchdog';

module.exports.State = {
  Running: 'running',
  Finished: 'finished'
};

module.exports.FinishedReason = {
  Succeeded: 'succeeded',
  Failed: 'failed'
};

module.exports.DeploymentType = {
  Current: 'current',
  Previous: 'previous',
  Empty: 'empty'
};

module.exports.ExpiredThresholdInSeconds = 60 * 6;
