/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {CdkPortalOutlet, ComponentPortal, ComponentType, Portal} from '@angular/cdk/portal';
import {
  AfterContentInit,
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChange,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import {DateAdapter, MAT_DATE_FORMATS, MatDateFormats} from '../core';
import {Subject, Subscription} from 'rxjs';
import {MatCalendarUserEvent, MatCalendarCellClassFunction} from './calendar-body';
import {createMissingDateImplError} from './datepicker-errors';
import {MatDatepickerIntl} from './datepicker-intl';
import {MatMonthView} from './month-view';
import {
  getActiveOffset,
  isSameMultiYearView,
  MatMultiYearView,
  yearsPerPage,
} from './multi-year-view';
import {MatYearView} from './year-view';
import {MAT_SINGLE_DATE_SELECTION_MODEL_PROVIDER, DateRange} from './date-selection-model';
import {MatIconButton, MatButton} from '../button';
import {_IdGenerator, CdkMonitorFocus} from '@angular/cdk/a11y';
import {_CdkPrivateStyleLoader, _VisuallyHiddenLoader} from '@angular/cdk/private';
import {_getFocusedElementPierceShadowDom} from '@angular/cdk/platform';

/**
 * Possible views for the calendar.
 * @docs-private
 */
export type MatCalendarView = 'month' | 'year' | 'multi-year';

/** Default header for MatCalendar */
@Component({
  selector: 'mat-calendar-header',
  templateUrl: 'calendar-header.html',
  exportAs: 'matCalendarHeader',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIconButton],
})
export class MatCalendarHeader<D> {
  private _intl = inject(MatDatepickerIntl);
  calendar = inject<MatCalendar<D>>(MatCalendar);
  private _dateAdapter = inject<DateAdapter<D>>(DateAdapter, {optional: true})!;
  private _dateFormats = inject<MatDateFormats>(MAT_DATE_FORMATS, {optional: true})!;
  private _periodButtonText: string;
  private _periodButtonDescription: string;
  private _periodButtonLabel: string;
  private _prevButtonLabel: string;
  private _nextButtonLabel: string;

  constructor(...args: unknown[]);

  constructor() {
    inject(_CdkPrivateStyleLoader).load(_VisuallyHiddenLoader);
    const changeDetectorRef = inject(ChangeDetectorRef);
    this._updateLabels();
    this.calendar.stateChanges.subscribe(() => {
      this._updateLabels();
      changeDetectorRef.markForCheck();
    });
  }

  /** The display text for the current calendar view. */
  get periodButtonText(): string {
    return this._periodButtonText;
  }

  /** The aria description for the current calendar view. */
  get periodButtonDescription(): string {
    return this._periodButtonDescription;
  }

  /** The `aria-label` for changing the calendar view. */
  get periodButtonLabel(): string {
    return this._periodButtonLabel;
  }

  /** The label for the previous button. */
  get prevButtonLabel(): string {
    return this._prevButtonLabel;
  }

  /** The label for the next button. */
  get nextButtonLabel(): string {
    return this._nextButtonLabel;
  }

  /** Handles user clicks on the period label. */
  currentPeriodClicked(): void {
    this.calendar.currentView = this.calendar.currentView == 'month' ? 'multi-year' : 'month';
  }

  /** Handles user clicks on the previous button. */
  previousClicked(): void {
    if (this.previousEnabled()) {
      this.calendar.activeDate =
        this.calendar.currentView == 'month'
          ? this._dateAdapter.addCalendarMonths(this.calendar.activeDate, -1)
          : this._dateAdapter.addCalendarYears(
              this.calendar.activeDate,
              this.calendar.currentView == 'year' ? -1 : -yearsPerPage,
            );
    }
  }

  /** Handles user clicks on the next button. */
  nextClicked(): void {
    if (this.nextEnabled()) {
      this.calendar.activeDate =
        this.calendar.currentView == 'month'
          ? this._dateAdapter.addCalendarMonths(this.calendar.activeDate, 1)
          : this._dateAdapter.addCalendarYears(
              this.calendar.activeDate,
              this.calendar.currentView == 'year' ? 1 : yearsPerPage,
            );
    }
  }

  /** Whether the previous period button is enabled. */
  previousEnabled(): boolean {
    if (!this.calendar.minDate) {
      return true;
    }
    return (
      !this.calendar.minDate || !this._isSameView(this.calendar.activeDate, this.calendar.minDate)
    );
  }

  /** Whether the next period button is enabled. */
  nextEnabled(): boolean {
    return (
      !this.calendar.maxDate || !this._isSameView(this.calendar.activeDate, this.calendar.maxDate)
    );
  }

  /** Updates the labels for the various sections of the header. */
  private _updateLabels() {
    const calendar = this.calendar;
    const intl = this._intl;
    const adapter = this._dateAdapter;

    if (calendar.currentView === 'month') {
      this._periodButtonText = adapter
        .format(calendar.activeDate, this._dateFormats.display.monthYearLabel)
        .toLocaleUpperCase();
      this._periodButtonDescription = adapter
        .format(calendar.activeDate, this._dateFormats.display.monthYearLabel)
        .toLocaleUpperCase();
      this._periodButtonLabel = intl.switchToMultiYearViewLabel;
      this._prevButtonLabel = intl.prevMonthLabel;
      this._nextButtonLabel = intl.nextMonthLabel;
    } else if (calendar.currentView === 'year') {
      this._periodButtonText = adapter.getYearName(calendar.activeDate);
      this._periodButtonDescription = adapter.getYearName(calendar.activeDate);
      this._periodButtonLabel = intl.switchToMonthViewLabel;
      this._prevButtonLabel = intl.prevYearLabel;
      this._nextButtonLabel = intl.nextYearLabel;
    } else {
      this._periodButtonText = intl.formatYearRange(...this._formatMinAndMaxYearLabels());
      // Format a label for the window of years displayed in the multi-year calendar view. Use
      // `formatYearRangeLabel` because it is TTS friendly.
      this._periodButtonDescription = intl.formatYearRangeLabel(
        ...this._formatMinAndMaxYearLabels(),
      );
      this._periodButtonLabel = intl.switchToMonthViewLabel;
      this._prevButtonLabel = intl.prevMultiYearLabel;
      this._nextButtonLabel = intl.nextMultiYearLabel;
    }
  }

  /** Whether the two dates represent the same view in the current view mode (month or year). */
  private _isSameView(date1: D, date2: D): boolean {
    if (this.calendar.currentView == 'month') {
      return (
        this._dateAdapter.getYear(date1) == this._dateAdapter.getYear(date2) &&
        this._dateAdapter.getMonth(date1) == this._dateAdapter.getMonth(date2)
      );
    }
    if (this.calendar.currentView == 'year') {
      return this._dateAdapter.getYear(date1) == this._dateAdapter.getYear(date2);
    }
    // Otherwise we are in 'multi-year' view.
    return isSameMultiYearView(
      this._dateAdapter,
      date1,
      date2,
      this.calendar.minDate,
      this.calendar.maxDate,
    );
  }

  /**
   * Format two individual labels for the minimum year and maximum year available in the multi-year
   * calendar view. Returns an array of two strings where the first string is the formatted label
   * for the minimum year, and the second string is the formatted label for the maximum year.
   */
  private _formatMinAndMaxYearLabels(): [minYearLabel: string, maxYearLabel: string] {
    // The offset from the active year to the "slot" for the starting year is the
    // *actual* first rendered year in the multi-year view, and the last year is
    // just yearsPerPage - 1 away.
    const activeYear = this._dateAdapter.getYear(this.calendar.activeDate);
    const minYearOfPage =
      activeYear -
      getActiveOffset(
        this._dateAdapter,
        this.calendar.activeDate,
        this.calendar.minDate,
        this.calendar.maxDate,
      );
    const maxYearOfPage = minYearOfPage + yearsPerPage - 1;
    const minYearLabel = this._dateAdapter.getYearName(
      this._dateAdapter.createDate(minYearOfPage, 0, 1),
    );
    const maxYearLabel = this._dateAdapter.getYearName(
      this._dateAdapter.createDate(maxYearOfPage, 0, 1),
    );

    return [minYearLabel, maxYearLabel];
  }

  _periodButtonLabelId = inject(_IdGenerator).getId('mat-calendar-period-label-');
}

/** A calendar that is used as part of the datepicker. */
@Component({
  selector: 'mat-calendar',
  templateUrl: 'calendar.html',
  styleUrl: 'calendar.css',
  host: {
    'class': 'mat-calendar',
  },
  exportAs: 'matCalendar',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MAT_SINGLE_DATE_SELECTION_MODEL_PROVIDER],
  imports: [CdkPortalOutlet, CdkMonitorFocus, MatMonthView, MatYearView, MatMultiYearView],
})
export class MatCalendar<D> implements AfterContentInit, AfterViewChecked, OnDestroy, OnChanges {
  private _dateAdapter = inject<DateAdapter<D>>(DateAdapter, {optional: true})!;
  private _dateFormats = inject<MatDateFormats>(MAT_DATE_FORMATS, {optional: true});
  private _changeDetectorRef = inject(ChangeDetectorRef);
  private _elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** An input indicating the type of the header component, if set. */
  @Input() headerComponent: ComponentType<any>;

  /** A portal containing the header component type for this calendar. */
  _calendarHeaderPortal: Portal<any>;

  private _intlChanges: Subscription;

  /**
   * Used for scheduling that focus should be moved to the active cell on the next tick.
   * We need to schedule it, rather than do it immediately, because we have to wait
   * for Angular to re-evaluate the view children.
   */
  private _moveFocusOnNextTick = false;

  /** A date representing the period (month or year) to start the calendar in. */
  @Input()
  get startAt(): D | null {
    return this._startAt;
  }
  set startAt(value: D | null) {
    this._startAt = this._dateAdapter.getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _startAt: D | null;

  /** Whether the calendar should be started in month or year view. */
  @Input() startView: MatCalendarView = 'month';

  /** The currently selected date. */
  @Input()
  get selected(): DateRange<D> | D | null {
    return this._selected;
  }
  set selected(value: DateRange<D> | D | null) {
    if (value instanceof DateRange) {
      this._selected = value;
    } else {
      this._selected = this._dateAdapter.getValidDateOrNull(this._dateAdapter.deserialize(value));
    }
  }
  private _selected: DateRange<D> | D | null;

  /** The minimum selectable date. */
  @Input()
  get minDate(): D | null {
    return this._minDate;
  }
  set minDate(value: D | null) {
    this._minDate = this._dateAdapter.getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _minDate: D | null;

  /** The maximum selectable date. */
  @Input()
  get maxDate(): D | null {
    return this._maxDate;
  }
  set maxDate(value: D | null) {
    this._maxDate = this._dateAdapter.getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _maxDate: D | null;

  /** Function used to filter which dates are selectable. */
  @Input() dateFilter: (date: D) => boolean;

  /** Function that can be used to add custom CSS classes to dates. */
  @Input() dateClass: MatCalendarCellClassFunction<D>;

  /** Start of the comparison range. */
  @Input() comparisonStart: D | null;

  /** End of the comparison range. */
  @Input() comparisonEnd: D | null;

  /** ARIA Accessible name of the `<input matStartDate/>` */
  @Input() startDateAccessibleName: string | null;

  /** ARIA Accessible name of the `<input matEndDate/>` */
  @Input() endDateAccessibleName: string | null;

  /** Emits when the currently selected date changes. */
  @Output() readonly selectedChange: EventEmitter<D | null> = new EventEmitter<D | null>();

  /**
   * Emits the year chosen in multiyear view.
   * This doesn't imply a change on the selected date.
   */
  @Output() readonly yearSelected: EventEmitter<D> = new EventEmitter<D>();

  /**
   * Emits the month chosen in year view.
   * This doesn't imply a change on the selected date.
   */
  @Output() readonly monthSelected: EventEmitter<D> = new EventEmitter<D>();

  /**
   * Emits when the current view changes.
   */
  @Output() readonly viewChanged: EventEmitter<MatCalendarView> = new EventEmitter<MatCalendarView>(
    true,
  );

  /** Emits when any date is selected. */
  @Output() readonly _userSelection: EventEmitter<MatCalendarUserEvent<D | null>> =
    new EventEmitter<MatCalendarUserEvent<D | null>>();

  /** Emits a new date range value when the user completes a drag drop operation. */
  @Output() readonly _userDragDrop = new EventEmitter<MatCalendarUserEvent<DateRange<D>>>();

  /** Reference to the current month view component. */
  @ViewChild(MatMonthView) monthView: MatMonthView<D>;

  /** Reference to the current year view component. */
  @ViewChild(MatYearView) yearView: MatYearView<D>;

  /** Reference to the current multi-year view component. */
  @ViewChild(MatMultiYearView) multiYearView: MatMultiYearView<D>;

  /**
   * The current active date. This determines which time period is shown and which date is
   * highlighted when using keyboard navigation.
   */
  get activeDate(): D {
    return this._clampedActiveDate;
  }
  set activeDate(value: D) {
    this._clampedActiveDate = this._dateAdapter.clampDate(value, this.minDate, this.maxDate);
    this.stateChanges.next();
    this._changeDetectorRef.markForCheck();
  }
  private _clampedActiveDate: D;

  /** Whether the calendar is in month view. */
  get currentView(): MatCalendarView {
    return this._currentView;
  }
  set currentView(value: MatCalendarView) {
    const viewChangedResult = this._currentView !== value ? value : null;
    this._currentView = value;
    this._moveFocusOnNextTick = true;
    this._changeDetectorRef.markForCheck();
    if (viewChangedResult) {
      this.stateChanges.next();
      this.viewChanged.emit(viewChangedResult);
    }
  }
  private _currentView: MatCalendarView;

  /** Origin of active drag, or null when dragging is not active. */
  protected _activeDrag: MatCalendarUserEvent<D> | null = null;

  /**
   * Emits whenever there is a state change that the header may need to respond to.
   */
  readonly stateChanges = new Subject<void>();

  constructor(...args: unknown[]);

  constructor() {
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      if (!this._dateAdapter) {
        throw createMissingDateImplError('DateAdapter');
      }

      if (!this._dateFormats) {
        throw createMissingDateImplError('MAT_DATE_FORMATS');
      }
    }

    this._intlChanges = inject(MatDatepickerIntl).changes.subscribe(() => {
      this._changeDetectorRef.markForCheck();
      this.stateChanges.next();
    });
  }

  ngAfterContentInit() {
    this._calendarHeaderPortal = new ComponentPortal(this.headerComponent || MatCalendarHeader);
    this.activeDate = this.startAt || this._dateAdapter.today();

    // Assign to the private property since we don't want to move focus on init.
    this._currentView = this.startView;
  }

  ngAfterViewChecked() {
    if (this._moveFocusOnNextTick) {
      this._moveFocusOnNextTick = false;
      this.focusActiveCell();
    }
  }

  ngOnDestroy() {
    this._intlChanges.unsubscribe();
    this.stateChanges.complete();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Ignore date changes that are at a different time on the same day. This fixes issues where
    // the calendar re-renders when there is no meaningful change to [minDate] or [maxDate]
    // (#24435).
    const minDateChange: SimpleChange | undefined =
      changes['minDate'] &&
      !this._dateAdapter.sameDate(changes['minDate'].previousValue, changes['minDate'].currentValue)
        ? changes['minDate']
        : undefined;
    const maxDateChange: SimpleChange | undefined =
      changes['maxDate'] &&
      !this._dateAdapter.sameDate(changes['maxDate'].previousValue, changes['maxDate'].currentValue)
        ? changes['maxDate']
        : undefined;

    const changeRequiringRerender = minDateChange || maxDateChange || changes['dateFilter'];

    if (changeRequiringRerender && !changeRequiringRerender.firstChange) {
      const view = this._getCurrentViewComponent();

      if (view) {
        // Schedule focus to be moved to the active date since re-rendering can blur the active
        // cell (see #29265), however don't do so if focus is outside of the calendar, because it
        // can steal away the user's attention (see #30635).
        if (this._elementRef.nativeElement.contains(_getFocusedElementPierceShadowDom())) {
          this._moveFocusOnNextTick = true;
        }

        // We need to `detectChanges` manually here, because the `minDate`, `maxDate` etc. are
        // passed down to the view via data bindings which won't be up-to-date when we call `_init`.
        this._changeDetectorRef.detectChanges();
        view._init();
      }
    }

    this.stateChanges.next();
  }

  /** Focuses the active date. */
  focusActiveCell() {
    this._getCurrentViewComponent()._focusActiveCell(false);
  }

  /** Updates today's date after an update of the active date */
  updateTodaysDate() {
    this._getCurrentViewComponent()._init();
  }

  /** Handles date selection in the month view. */
  _dateSelected(event: MatCalendarUserEvent<D | null>): void {
    const date = event.value;

    if (
      this.selected instanceof DateRange ||
      (date && !this._dateAdapter.sameDate(date, this.selected))
    ) {
      this.selectedChange.emit(date);
    }

    this._userSelection.emit(event);
  }

  /** Handles year selection in the multiyear view. */
  _yearSelectedInMultiYearView(normalizedYear: D) {
    this.yearSelected.emit(normalizedYear);
  }

  /** Handles month selection in the year view. */
  _monthSelectedInYearView(normalizedMonth: D) {
    this.monthSelected.emit(normalizedMonth);
  }

  /** Handles year/month selection in the multi-year/year views. */
  _goToDateInView(date: D, view: 'month' | 'year' | 'multi-year'): void {
    this.activeDate = date;
    this.currentView = view;
  }

  /** Called when the user starts dragging to change a date range. */
  _dragStarted(event: MatCalendarUserEvent<D>) {
    this._activeDrag = event;
  }

  /**
   * Called when a drag completes. It may end in cancelation or in the selection
   * of a new range.
   */
  _dragEnded(event: MatCalendarUserEvent<DateRange<D> | null>) {
    if (!this._activeDrag) return;

    if (event.value) {
      this._userDragDrop.emit(event as MatCalendarUserEvent<DateRange<D>>);
    }

    this._activeDrag = null;
  }

  /** Returns the component instance that corresponds to the current calendar view. */
  private _getCurrentViewComponent(): MatMonthView<D> | MatYearView<D> | MatMultiYearView<D> {
    // The return type is explicitly written as a union to ensure that the Closure compiler does
    // not optimize calls to _init(). Without the explicit return type, TypeScript narrows it to
    // only the first component type. See https://github.com/angular/components/issues/22996.
    return this.monthView || this.yearView || this.multiYearView;
  }
}
