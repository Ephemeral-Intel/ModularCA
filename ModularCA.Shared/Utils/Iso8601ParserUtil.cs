using System.Text.RegularExpressions;

namespace ModularCA.Shared.Utils
{
    /// <summary>
    /// Parses ISO 8601 duration strings (e.g., P1Y6M10D) into TimeSpan values.
    /// </summary>
    public class Iso8601ParserUtil()
    {
        /// <summary>
        /// Converts an ISO 8601 duration string into a TimeSpan relative to the current UTC time.
        /// </summary>
        public static TimeSpan ParseIso8601(string duration)
        {

            // Only supports: PnY, PnM, PnD, or combinations like P1Y6M10D
            int years = 0, months = 0, days = 0;

            if (!duration.StartsWith("P"))
                throw new FormatException("Invalid duration format");

            duration = duration.Substring(1); // remove 'P'
            var matches = Regex.Matches(duration, @"(\d+)([YMD])");

            foreach (Match match in matches)
            {
                var value = int.Parse(match.Groups[1].Value);
                switch (match.Groups[2].Value)
                {
                    case "Y": years = value; break;
                    case "M": months = value; break;
                    case "D": days = value; break;
                }
            }

            var future = DateTime.UtcNow.AddYears(years).AddMonths(months).AddDays(days);
            return future - DateTime.UtcNow; // returns as a TimeSpan
        }
    }
}
