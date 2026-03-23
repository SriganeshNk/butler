export type Participant = "You" | "Wife";

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
  author: Participant;
  text: string;
  createdAt: string;
  previews: LinkPreview[];
};
