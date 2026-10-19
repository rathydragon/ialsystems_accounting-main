import { describe, it, expect } from 'vitest';
import {
  parseBookingText,
  extractPhones,
  matchTeamMember,
  isAuthorizedAssigner,
  messageAuthor,
} from '../../api/telegram-booking-parser.js';

describe('parseBookingText', () => {
  it('reads customer, phone and service from a typical post', () => {
    expect(parseBookingText('Amrurice HQ has shipment Overseas 0963725526')).toMatchObject({
      customer: 'Amrurice HQ',
      phone: '0963725526',
      serviceType: 'Overseas',
    });
  });

  it('handles a leading phone number and +855 format', () => {
    expect(parseBookingText('089555016 fuji has shipment need tuktuk សុំមុនម៉ោង 5កន្លះ')).toMatchObject({
      customer: 'fuji',
      phone: '089555016',
      serviceType: 'Tuktuk',
    });
    expect(parseBookingText('+855 99 777 698 SafetyNet has shipment local')).toMatchObject({
      customer: 'SafetyNet',
      phone: '099777698',
      serviceType: 'Local',
    });
  });

  it('extracts location after "at" / "near" and keeps map links', () => {
    expect(parseBookingText('098395013 has shipment need moto at May Bank Toul Kork')).toMatchObject({
      customer: '',
      serviceType: 'Moto',
      location: 'May Bank Toul Kork',
    });
    expect(parseBookingText('Raf has shipment by DHL From Mr Hean 095552025. near IFL')).toMatchObject({
      customer: 'Raf',
      phone: '095552025',
      serviceType: 'DHL',
      location: 'near IFL',
    });
    const r = parseBookingText('098864449 has shipment need Tuk tuk at https://maps.app.goo.gl/FoLHm2xgwr1GAWJ56');
    expect(r.mapUrl).toBe('https://maps.app.goo.gl/FoLHm2xgwr1GAWJ56');
    expect(r.serviceType).toBe('Tuktuk');
  });

  it('reads the phone from Khmer text and a Khmer location', () => {
    const r = parseBookingText('098973231, មានអីវ៉ាន់ផ្ញើជាប្រភេទកាំកសាំង នៅទួលមុខពេទ្យរុស្សី');
    expect(r.phone).toBe('098973231');
    expect(r.location).toBe('នៅទួលមុខពេទ្យរុស្សី');
  });

  it('normalizes landline style numbers', () => {
    expect(extractPhones('Amrurice Kop Srov has shipment Overseas 031 334 4668')).toEqual(['0313344668']);
  });
});

describe('matchTeamMember', () => {
  const team = [
    { name: 'Rin', aliases: ['rin driver'], active: true },
    { name: 'Vuthy', aliases: 'vuthy, វុទ្ធី', active: true },
    { name: 'Sna', aliases: [], active: true },
    { name: 'Old', aliases: [], active: false },
  ];

  it('matches names and aliases case-insensitively, ignoring "driver"', () => {
    expect(matchTeamMember('rin driver', team)).toEqual({ name: 'Rin', matched: true });
    expect(matchTeamMember('Rin Driver', team)).toEqual({ name: 'Rin', matched: true });
    expect(matchTeamMember('VUthy', team)).toEqual({ name: 'Vuthy', matched: true });
    expect(matchTeamMember('វុទ្ធី', team)).toEqual({ name: 'Vuthy', matched: true });
    expect(matchTeamMember('ok Sna take it', team)).toEqual({ name: 'Sna', matched: true });
  });

  it('returns the cleaned reply text when nobody matches', () => {
    expect(matchTeamMember('Thear driver', team)).toEqual({ name: 'Thear', matched: false });
    expect(matchTeamMember('old', team).matched).toBe(false);
  });
});

describe('isAuthorizedAssigner', () => {
  const cfg = { assignerIds: ['556322085'], assignerNames: ['B Khu 011'] };

  it('trusts the user id when Telegram sends one', () => {
    expect(isAuthorizedAssigner({ id: 556322085, name: 'Anyone' }, cfg)).toBe(true);
    expect(isAuthorizedAssigner({ id: 111, name: 'B Khu 011' }, cfg)).toBe(false);
  });

  it('falls back to the channel author signature', () => {
    expect(isAuthorizedAssigner({ id: null, name: 'B Khu 011' }, cfg)).toBe(true);
    expect(isAuthorizedAssigner({ id: null, name: 'b khu 011 ' }, cfg)).toBe(true);
    expect(isAuthorizedAssigner({ id: null, name: 'Tevan' }, cfg)).toBe(false);
    expect(isAuthorizedAssigner({ id: null, name: '' }, cfg)).toBe(false);
  });

  it('reads the author from channel posts and group messages', () => {
    expect(messageAuthor({ author_signature: 'B Khu 011', sender_chat: { title: 'IAL Booking' } })).toEqual({ name: 'B Khu 011', id: null });
    expect(messageAuthor({ from: { id: 556322085, first_name: 'B Khu', last_name: '011' } })).toEqual({ name: 'B Khu 011', id: 556322085 });
  });
});
