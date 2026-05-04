export type ClinicResult = {
  placeId: string;
  name: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  phone?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  weekdayDescriptions?: string[];
  distanceMeters?: number;
  googleMapsUri: string;
};
