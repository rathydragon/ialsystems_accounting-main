import { SheetColumnDef, SheetRowData } from '../../utils/googleSheetFetcher';
import { DistributionReportItem, WarehouseScanItem } from '../../types';

export interface BarcodeWarehouseSummary {
  totalScans: number;
  scans: WarehouseScanItem[];
  scanIn?: WarehouseScanItem;
  outOfDelivery?: WarehouseScanItem;
  holdRemaining?: WarehouseScanItem;
  scanOut?: WarehouseScanItem;
  dist?: DistributionReportItem;
  hasHistory: boolean;
}

export interface PackageDetails {
  barcode: string;
  date: string;
  shipper: string;
  consignee: string;
  phone: string;
  destination: string;
  reDest: string;
  origin: string;
  payment: string;
  handleBy: string;
  status: string;
  description: string;
  teams: string;
  location: string;
}

export type StatusFilterOption = 'ALL' | 'DELIVERED' | 'NOT_DELIVERED';
export type TeamsFilterOption = 'ALL' | 'IAL_OR_DEL';
export type LocationFilterOption = 'ALL' | 'LOCATION_VALID';
export type TableDensity = 'compact' | 'normal';
export type ViewMode = 'table' | 'cards';

export interface ColumnFiltersState {
  selectedShipper: string[];
  selectedDestination: string[];
  selectedReDest: string[];
  selectedOrigin: string[];
  selectedStatusVal: string[];
  selectedCustomersCare: string[];
  filterStartDate: string;
  filterEndDate: string;
}

export interface MetricCounts {
  total: number;
  delivered: number;
  nonDelivered: number;
  ial: number;
  del: number;
  outOfTown: number;
  cityTown: number;
  deliveredFiltered: number;
  nonDeliveredFiltered: number;
  ialFiltered: number;
  delFiltered: number;
  outOfTownFiltered: number;
  cityTownFiltered: number;
}
