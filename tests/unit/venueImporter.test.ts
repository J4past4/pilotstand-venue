import { describe, expect, it } from 'vitest';
import {
  EXCEL_LONDON_CLEANTECH_VENUE,
  SAMPLE_CSV_TEMPLATE,
  parseVenueCsv,
  parseVenueJson,
} from '../../src/utils/venueImporter';

describe('Organizer Studio — CSV/JSON Floorplan Importer & Multi-Show Venues', () => {
  it('parses the sample organizer CSV template into a full ExhibitionVenue with zones, entrances & toilets', () => {
    const venue = parseVenueCsv(SAMPLE_CSV_TEMPLATE, {
      name: 'UK Industrial Show',
      edition: '2026',
      organizer: 'Easyfairs UK',
      venueLocation: 'ExCeL London',
      hallName: 'Hall S4',
    });

    expect(venue.name).toBe('UK Industrial Show');
    expect(venue.stands.length).toBe(9);
    expect(venue.zones.length).toBe(2);
    expect(venue.stands.filter((s) => s.status === 'available').length).toBe(4);
    expect(venue.stands.filter((s) => s.status === 'sold').length).toBe(3);
    expect(venue.stands.filter((s) => s.status === 'feature').length).toBe(1);
    expect(venue.entrances.length).toBeGreaterThanOrEqual(1);
    expect(venue.amenities.some((a) => a.kind === 'toilets')).toBe(true);
  });

  it('round-trips a venue through JSON export and import', () => {
    const raw = JSON.stringify(EXCEL_LONDON_CLEANTECH_VENUE);
    const imported = parseVenueJson(raw);
    expect(imported.id).toBe(EXCEL_LONDON_CLEANTECH_VENUE.id);
    expect(imported.stands.length).toBe(EXCEL_LONDON_CLEANTECH_VENUE.stands.length);
    expect(imported.brandTheme?.organizerName).toBe('CleanTech Expo');
  });

  it('throws a clear error on malformed CSV missing required columns', () => {
    expect(() =>
      parseVenueCsv('foo,bar\n1,2', {
        name: 'Bad',
        edition: '2026',
        organizer: 'Org',
        venueLocation: 'UK',
        hallName: 'H1',
      })
    ).toThrow(/stand_id/i);
  });
});
