export type Period = { start: string; end: string };

export type PulseTarget = {
  username: string;
  currentPeriod: Period;
  previousPeriod: Period;
};

export type XUser = {
  id: string;
  username: string;
  name: string;
  followers: number;
};

export type XPost = {
  id: string;
  url: string;
  text: string;
  author: XUser;
  createdAt: string;
  metrics: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  };
};

export type XWeeklyCollection = PulseTarget & {
  account: XUser;
  current: XPost[];
  previous: XPost[];
  truncated: boolean;
};
