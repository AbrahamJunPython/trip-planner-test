export type Step = 'area' | 'genre' | 'confirm'

export type State = {
  step: Step
  area?: string
  genre?: string
}

export type OgpProvider =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "website";

export type Ogp = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  provider?: OgpProvider;
};

