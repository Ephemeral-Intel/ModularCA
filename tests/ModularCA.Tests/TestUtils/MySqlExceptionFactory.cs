using System.Reflection;
using System.Runtime.CompilerServices;
using MySqlConnector;

namespace ModularCA.Tests.TestUtils;

/// <summary>
/// Constructs <see cref="MySqlException"/> instances with controlled error numbers for unit
/// testing. MySqlConnector exposes no public constructor that lets test code set
/// <see cref="MySqlException.Number"/> (or its sibling <c>ErrorCode</c> enum) directly, so
/// this helper builds an uninitialized instance via <see cref="RuntimeHelpers.GetUninitializedObject"/>
/// and reflects into the auto-property backing fields.
/// <para>
/// MySqlConnector 2.4 stores <see cref="MySqlException.Number"/> as its own auto-property
/// backed by <c>&lt;Number&gt;k__BackingField</c> (NOT computed from <c>ErrorCode</c> at
/// read-time as you might expect). The helper sets both the Number int field and the
/// ErrorCode enum field so test consumers reading either property see consistent values.
/// </para>
/// <para>
/// Centralized here so a future MySqlConnector upgrade that renames or restructures the
/// backing fields only breaks one place — the helper — instead of cascading through every
/// test that asserts on the result.
/// </para>
/// </summary>
internal static class MySqlExceptionFactory
{
    public static MySqlException With(int number)
    {
        var ex = (MySqlException)RuntimeHelpers.GetUninitializedObject(typeof(MySqlException));

        // Find both backing fields by type rather than by name. The backing-field naming
        // convention <PropertyName>k__BackingField is a compiler implementation detail.
        FieldInfo? numberField = null;
        FieldInfo? errorCodeField = null;
        for (Type? t = typeof(MySqlException); t != null && t != typeof(object); t = t.BaseType)
        {
            foreach (var f in t.GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
            {
                if (numberField == null && f.FieldType == typeof(int) && f.Name.Contains("Number"))
                    numberField = f;
                else if (errorCodeField == null && f.FieldType.IsEnum && f.FieldType.Name == "MySqlErrorCode")
                    errorCodeField = f;
            }
            if (numberField != null && errorCodeField != null) break;
        }

        if (numberField == null)
            throw new InvalidOperationException(
                "MySqlException has no int Number-named field — MySqlConnector internal layout " +
                "changed. Update MySqlExceptionFactory to match.");

        numberField.SetValue(ex, number);

        // ErrorCode field is best-effort — if it's missing in a future version, tests that read
        // .Number still work; tests that read .ErrorCode would break separately.
        if (errorCodeField != null)
            errorCodeField.SetValue(ex, Enum.ToObject(errorCodeField.FieldType, number));

        return ex;
    }
}
