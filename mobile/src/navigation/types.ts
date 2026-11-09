export type TabParamList = {
  Home: undefined;
  Animals: undefined;
  Health: { animalId?: string } | undefined;
  Assistant: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  AnimalForm: undefined;
  AnimalDetail: { animalId: string };
  Vaccinations: undefined;
  Nutrition: undefined;
  SyncCentre: undefined;
  NearbyVets: undefined;
};
