export type LinkPreview = {
  url: string;
  hostname: string;
  title: string;
  description: string;
  image?: string;
  siteName?: string;
};

export type ChatMessage = {
  id: string;
  authorEmail: string;
  authorName: string;
  text: string;
  createdAt: string;
  previews: LinkPreview[];
};

export type AppUser = {
  email: string;
  name: string;
  image: string | null;
};

export type PendingInvitation = {
  direction: "incoming" | "outgoing";
  email: string;
  inviterName?: string;
};

export type ChatRoom = {
  viewer: AppUser;
  partner: AppUser | null;
  invitation: PendingInvitation | null;
  messages: ChatMessage[];
};
