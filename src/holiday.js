import Holidays from 'date-holidays';

export function addBusinessDays(country, state, startDate, daysToAdd) {
    const holidays = new Holidays(country, state);
    const isHoliday = (date) => holidays.isHoliday(date);

    const weekend = { 6: 'saturday', 0: 'sunday' };
    const isWeekend = (date) => !!weekend[date.getDay()];

    // start from startDate param
    const date = new Date(startDate);

    // add days until daysToAdd reaches zero
    while (daysToAdd > 0) {
        date.setDate(date.getDate() + 1);

        const isBusinessDay = !isHoliday(date) && !isWeekend(date);

        // only decrement for business days
        if (isBusinessDay) {
            daysToAdd -= 1;
        }
    }

    return date;
}