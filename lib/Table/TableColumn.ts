import countBy from "lodash.countby";
import { computed } from "mobx";
import createStratumInstance from "../Models/createStratumInstance";
import Model from "../Models/Model";
import ModelPropertiesFromTraits from "../Models/ModelPropertiesFromTraits";
import TableColumnTraits from "../Traits/TableColumnTraits";
import TableTraits from "../Traits/TableTraits";
import TableColumnType, { stringToTableColumnType } from "./TableColumnType";

interface TableModel extends Model<TableTraits> {
  readonly dataColumnMajor: string[][] | undefined;
}

export interface ColumnValuesAsNumbers {
  readonly values: ReadonlyArray<number | null>;
  readonly minimum: number | undefined;
  readonly maximum: number | undefined;
  readonly numberOfValidNumbers: number;
  readonly numberOfNonNumbers: number;
}

export interface UniqueColumnValues {
  /**
   * Gets the unique values, ordered from most common to least common.
   */
  readonly values: ReadonlyArray<string>;

  /**
   * Gets the count of each value. This is a parallel array to
   * {@link #values}.
   */
  readonly counts: ReadonlyArray<number>;
}

/**
 * A column of tabular data.
 */
export default class TableColumn {
  readonly columnNumber: number;
  readonly tableModel: TableModel;

  constructor(tableModel: TableModel, columnNumber: number) {
    this.columnNumber = columnNumber;
    this.tableModel = tableModel;
  }

  /**
   * Gets the raw, uninterpreted values in the column.
   */
  @computed
  get values(): readonly string[] {
    const result: string[] = [];

    if (this.tableModel.dataColumnMajor !== undefined) {
      // Copy all but the first element (which is the header), and trim along the way.
      const source = this.tableModel.dataColumnMajor[this.columnNumber];
      for (let i = 1; i < source.length; ++i) {
        result.push(source[i].trim());
      }
    }

    return result;
  }

  /**
   * Gets the column values as numbers, and returns information about how many
   * rows were successfully converted to numbers and the range of values.
   */
  @computed
  get valuesAsNumbers(): ColumnValuesAsNumbers {
    const numbers: (number | null)[] = [];
    let minimum = Number.MAX_VALUE;
    let maximum = -Number.MAX_VALUE;
    let numberOfValidNumbers = 0;
    let numberOfNonNumbers = 0;

    const replaceWithZero = this.traits.replaceWithZeroValues;
    const replaceWithNull = this.traits.replaceWithNullValues;

    const values = this.values;
    for (let i = 0; i < values.length; ++i) {
      const value = values[i];

      let n: number | null;
      if (replaceWithZero && replaceWithZero.indexOf(value) >= 0) {
        n = 0;
      } else if (replaceWithNull && replaceWithNull.indexOf(value) >= 0) {
        n = null;
      } else {
        n = toNumber(values[i]);
        if (n === null) {
          ++numberOfNonNumbers;
        }
      }

      if (n !== null) {
        ++numberOfValidNumbers;
        minimum = Math.min(minimum, n);
        maximum = Math.max(maximum, n);
      }

      numbers.push(n);
    }

    return {
      values: numbers,
      minimum: minimum === Number.MAX_VALUE ? undefined : minimum,
      maximum: maximum === -Number.MAX_VALUE ? undefined : maximum,
      numberOfValidNumbers: numberOfValidNumbers,
      numberOfNonNumbers: numberOfNonNumbers
    };
  }

  /**
   * Gets the unique values in this column.
   */
  @computed
  get uniqueValues(): UniqueColumnValues {
    const count = countBy(this.values);

    function toArray(key: string, value: number): [string, number] {
      return [key, value];
    }
    const countArray = Object.keys(count).map(key => toArray(key, count[key]));
    countArray.sort(function(a, b) {
      return b[1] - a[1];
    });

    return {
      values: countArray.map(a => a[0]),
      counts: countArray.map(a => a[1])
    };
  }

  /**
   * Gets the name of this column. If the column's name is blank, this property
   * will return `Column#` where `#` is the zero-based index of the column.
   */
  @computed
  get name(): string {
    const data = this.tableModel.dataColumnMajor;
    if (
      data === undefined ||
      data.length < this.columnNumber ||
      data[this.columnNumber].length < 1 ||
      data[this.columnNumber].length === 0
    ) {
      return "Column" + this.columnNumber;
    }
    return data[this.columnNumber][0];
  }

  /**
   * Gets the {@link TableColumnTraits} for this column.
   */
  @computed
  get traits(): ModelPropertiesFromTraits<TableColumnTraits> {
    const columns = this.tableModel.columns || [];
    return (
      columns.find(column => column.name === this.name) ||
      createStratumInstance(TableColumnTraits)
    );
  }

  /**
   * Gets the type of this column. If {@link #traits} has an explicit
   * {@link TableColumnTraits#type} specified, it is returned directly.
   * Otherwise, the type is guessed from the column name and contents.
   */
  @computed
  get type(): TableColumnType {
    // Use the explicit column type, if any.
    let type: TableColumnType | undefined;
    if (this.traits.type !== undefined) {
      type = stringToTableColumnType(this.traits.type);
    }

    if (type === undefined) {
      type = this.guessColumnTypeFromName(this.name);
    }

    if (type === undefined) {
      // No hints from the name, so this column is: a scalar (number), an
      // enumeration, or arbitrary text (e.g. a description).

      // We'll treat it as a scalar if _most_ of values can be successfully
      // parsed as numbers, i.e. the number of successful parsings is ~10x
      // the number of failed parsings. Note that replacements with null
      // or zero are counted as neither failed nor successful.

      const numbers = this.valuesAsNumbers;
      if (
        numbers.numberOfNonNumbers <=
        Math.ceil(numbers.numberOfValidNumbers * 0.1)
      ) {
        type = TableColumnType.scalar;
      } else {
        // Lots of strings that can't be parsed as numbers.
        // If there are relatively few different values, treat it as an enumeration.
        // If there are heaps of different values, treat it as just ordinary
        // free-form text.
        const uniqueValues = this.uniqueValues.values;
        if (
          uniqueValues.length <= 7 ||
          uniqueValues.length < this.values.length / 10
        ) {
          type = TableColumnType.enum;
        } else {
          type = TableColumnType.text;
        }
      }
    }

    return type;
  }

  /**
   * Gets a function that can be used to retrieve the value of this column for
   * a given row as a type appropriate for the column {@link #type}. For
   * example, if {@link #type} is {@link TableColumnType#scalar}, the value
   * will be a number or null.
   */
  @computed
  get valueFunctionForType(): (rowIndex: number) => string | number | null {
    if (this.type === TableColumnType.scalar) {
      const values = this.valuesAsNumbers.values;
      return function(rowIndex: number) {
        return values[rowIndex];
      };
    }

    const values = this.values;
    return function(rowIndex: number) {
      return values[rowIndex];
    };
  }

  private guessColumnTypeFromName(name: string): TableColumnType | undefined {
    const typeHintSet = [
      { hint: /^(lon|long|longitude|lng)$/i, type: TableColumnType.longitude },
      { hint: /^(lat|latitude)$/i, type: TableColumnType.latitude },
      { hint: /^(address|addr)$/i, type: TableColumnType.address },
      {
        hint: /^(.*[_ ])?(depth|height|elevation|altitude)$/i,
        type: TableColumnType.height
      },
      { hint: /^(.*[_ ])?(time|date)/i, type: TableColumnType.time }, // Quite general, eg. matches "Start date (AEST)".
      { hint: /^(year)$/i, type: TableColumnType.time } // Match "year" only, not "Final year" or "0-4 years".
    ];

    const match = typeHintSet.find(hint => hint.hint.test(name));
    if (match !== undefined) {
      return match.type;
    }
    return undefined;
  }
}

const allCommas = /,/g;

function toNumber(value: string): number | null {
  // Remove commas and try to parse as a number.
  // `Number()` requires that the entire string form a number, unlike
  // parseInt and parseFloat which allow extra non-number characters
  // at the end.
  const withoutCommas = value.replace(allCommas, "");
  const asNumber = Number(withoutCommas);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }
  return null;
}