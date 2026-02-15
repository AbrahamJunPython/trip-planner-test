import { z } from "zod";

// URL validation
export const urlSchema = z.string().url().max(2048);

// Place validation
export const placeSchema = z.object({
  url: urlSchema,
  category: z.enum(["visit", "food", "hotel", "move"]),
  name: z.string().min(1).max(200),
  address: z.string().max(500),
});

// Chat request validation
export const chatRequestSchema = z.object({
  place: placeSchema,
  context: z.object({
    depart: z.string().max(200).nullable(),
  }),
  ogpData: z.any().optional(),
  integratedContext: z.object({
    schemaVersion: z.string().max(20),
    flowId: z.string().max(100).nullable(),
    depart: z.object({
      selected: z.string().max(200).nullable(),
      mode: z.string().max(20).nullable(),
      coords: z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      }).nullable(),
      locationInfo: z.object({
        latitude: z.number().min(-90).max(90).nullable(),
        longitude: z.number().min(-180).max(180).nullable(),
        postcode: z.string().max(20).nullable(),
        city: z.string().max(100).nullable(),
        prefecture: z.string().max(100).nullable(),
      }).nullable(),
    }),
    items: z.array(z.object({
      item_id: z.string().max(100),
      normalized_url: z.string().max(2048),
      ogp: z.object({
        url: z.string().max(2048),
        title: z.string().max(500).nullable(),
        description: z.string().max(4000).nullable(),
        image: z.string().max(2048).nullable(),
        siteName: z.string().max(200).nullable(),
        favicon: z.string().max(2048).nullable(),
        provider: z.string().max(30).nullable(),
      }),
      classify_place: z.object({
        category: z.string().max(30).nullable(),
        name: z.string().max(200).nullable(),
        address: z.string().max(500).nullable(),
      }).nullable(),
      geocode: z.object({
        latitude: z.number().min(-90).max(90).nullable(),
        longitude: z.number().min(-180).max(180).nullable(),
      }).nullable(),
    })).max(30),
  }).optional(),
});

// Generate request validation
export const generateRequestSchema = z.object({
  tripName: z.string().min(1).max(100),
  depart: z.object({
    type: z.enum(["station", "postal"]),
    value: z.string().min(1).max(200),
    coords: z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }).optional(),
  }),
  destination: z.union([
    z.string().min(1).max(500),
    z.array(z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      url: urlSchema,
    })),
  ]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  tripDays: z.number().int().min(1).max(30).optional(),
  stayDays: z.number().int().min(0).max(29).optional(),
  people: z.number().int().min(1).max(100).nullable(),
  companion: z.enum(["一人旅", "カップル", "友達同士", "子供連れ", "大人だけの家族旅行", "その他"]).nullable(),
  budget: z.enum([
    "出費を最低限に抑えた旅行",
    "安く抑えつつ旅先を満喫",
    "出し惜しみせずに旅先を堪能",
    "ちょっぴり贅沢で特別な旅行",
    "高級なラグジュアリー旅行"
  ]).nullable(),
  gender: z.string().max(10).nullable().optional(),
  age: z.string().max(10).nullable().optional(),
  classifiedPlaces: z.array(placeSchema).optional(),
});

// OGP request validation
export const ogpRequestSchema = z.object({
  urls: z.array(urlSchema).min(1).max(10),
});

// Classify place request validation
export const classifyPlaceRequestSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  url: urlSchema,
});

// Helper function to validate and return errors
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, errors: result.error };
}
