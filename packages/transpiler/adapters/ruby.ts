// The built-in Ruby adapter.
//
// Ruby's own parser, through `Ripper` in its standard library — so it needs only the `ruby` the
// machine already has. Ripper hands back an s-expression rather than a typed tree, so the walk here
// is looser than the others, but the *parse* is Ruby's: a file Ruby cannot read produces a failure
// rather than a guess.
//
// Nothing reports a type, because Ruby annotates nothing. A spec that wrote `## arg invoice: Invoice`
// still has its parameter checked for existence; the type is simply never contradicted, which is the
// same rule as a TypeScript parameter written without an annotation.

import type { AdapterReading } from './contract.js';
import { runAdapter } from './run.js';

const SCRIPT = `
require 'ripper'
require 'json'

# The first identifier or constant beneath a node — which for a def or a class is its name.
def name_of(node)
  return nil unless node.is_a?(Array)
  return node[1] if node[0] == :@ident || node[0] == :@const

  node.each do |child|
    found = name_of(child)
    return found if found
  end

  nil
end

def parameters(node)
  return [] unless node.is_a?(Array)

  names = []

  if node[0] == :params
    # Required, optional and keyword parameters, in the shape Ripper reports each of them.
    Array(node[1]).each { |p| names << name_of(p) }
    Array(node[2]).each { |p| names << name_of(p && p[0]) }
    Array(node[5]).each { |p| names << name_of(p && p[0]) }
    return names.compact.map { |n| { 'name' => n } }
  end

  node.each do |child|
    found = parameters(child)
    return found unless found.empty?
  end

  []
end

def walk(node, out)
  return unless node.is_a?(Array)

  case node[0]
  when :def
    name = name_of(node[1])
    out << { 'kind' => 'function', 'name' => name, 'params' => parameters(node[2]) } if name
  when :class, :module
    name = name_of(node[1])
    out << { 'kind' => node[0].to_s, 'name' => name } if name
  end

  node.each { |child| walk(child, out) }
end

source = File.read(ARGV[0])
tree = Ripper.sexp(source)

if tree.nil?
  STDERR.write('ruby could not parse the file')
  exit(2)
end

symbols = []
walk(tree, symbols)

puts JSON.generate({ 'symbols' => symbols })
`;

export async function rubySymbols(projectRootPath: string, file: string): Promise<AdapterReading> {
    return runAdapter(
        'ruby',
        [
            '-e',
            SCRIPT,
            file,
        ],
        projectRootPath,
    );
}
